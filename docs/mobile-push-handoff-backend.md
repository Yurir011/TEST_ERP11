# 모바일 푸시(FCM) — 서버·프론트 인수인계

> 대상: 서버(백엔드)·프론트 구현 담당자와 그 Claude Code
> 작성일: 2026-11-08
> 전체 계획·배경은 [mobile-push-fcm.md](mobile-push-fcm.md) (4~6단계가 이 문서의 구현 범위). 이 문서는 **현재 상태, 이미 정해진 값, 문서와 달라진 점, 남은 작업**만 정리한다.

---

## 1. 한 줄 요약

**iOS 앱(네이티브) 쪽은 끝났다.** 앱은 푸시를 받을 준비가 되어 있고 실기기에서 `/m` 로그인까지 확인했다.
**알림이 실제로 오려면 서버(4단계)와 `/m` 화면(5단계) 코드가 필요하고, 둘 다 아직 없다.** 이 문서의 작업이 그 둘이다.

```
ERP 서버에서 Notification 저장 → (4단계) Firebase Admin SDK 로 FCM 발송
  → FCM → APNs → 아이폰 → 탭하면 /m 화면의 해당 위치로 이동 (5단계)
토큰 등록: 앱(/m 화면, 5단계) → POST /api/push/devices (4단계) → device_tokens 저장
```

## 2. 진행 현황

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | Apple APNs 인증 키(.p8) 발급 | 완료 |
| 2 | Firebase 프로젝트·iOS 앱 등록·APNs 키 업로드(개발 키)·서비스 계정 키 | 완료 |
| 3 | iOS 앱: 플러그인·plist·capability·AppDelegate·실기기 빌드 | 완료 (실기기에서 `/m` 로그인 확인) |
| 4 | 백엔드: 설정·`device_tokens`·API·발송·알림 연결 | **구현 완료 (2026-11-08)** — `services/push.py`, `routers/push.py`, 마이그레이션 `0031_device_tokens` (현재 head 가 0030 이라 0029 가 아니라 0031) |
| 5 | 프론트(`/m`): 권한 요청·토큰 등록·알림 탭 이동 | **구현 완료 (2026-11-08)** — `lib/push.ts`, `features/mobile/useMobilePush.ts`, `mobilePaths.ts`, 로그아웃 때 토큰 해제 |
| 6 | 테스트·배포 | 4·5 이후 |

현재 저장소에 `firebase`, `fcm`, `device_token` 관련 서버·프론트 코드는 **전혀 없다** (확인 완료).

## 3. 이미 정해진 값

비밀 값은 이 문서에 적지 않는다. 파일은 별도로 전달받았거나 아래 위치에 있다.

| 항목 | 값 |
|---|---|
| Firebase 프로젝트 ID | `bench-erp` |
| iOS 번들 ID | `kr.co.bench.erp` (Xcode·Capacitor·Firebase 모두 동일) |
| 서비스 계정 | `firebase-adminsdk-fbsvc@bench-erp.iam.gserviceaccount.com` |
| 서비스 계정 키 파일 | 서버 `backend/secrets/firebase-service-account.json` (**이미 서버·도커에 올려 둠**, git 제외) |
| APNs 키 | Firebase 에 **개발(Development) 키만** 업로드됨. 프로덕션 키 칸은 비어 있음 (§7 참고) |
| 앱이 여는 주소 | `https://www.epik.bio/m` (HTTPS. `mobile/capacitor.config.ts` 기본값) |
| 서버 상태 | `/api/health` 정상, 서버 버전 V.0.72.052 |

`.gitignore` 에 `backend/secrets/`, `*.p8`, `*firebase-adminsdk*.json`, `mobile/certificate/` 가 들어 있다. **서비스 계정 JSON·.p8 은 절대 커밋하지 않는다.**

## 4. 원본 문서(mobile-push-fcm.md)와 달라지거나 보강할 점

원본 4~5단계를 그대로 따르되, 코드를 확인한 결과 아래는 **반드시 반영**해야 한다.

### 4-1. 알림 `link` 는 PC 경로다 → 푸시용으로 /m 경로로 바꿔야 한다
- `Notification.link` 에는 PC 화면 경로가 저장된다. 예: `/documents?open=12`, `/leaves?open=5`.
- 모바일 화면에는 이를 바꾸는 함수가 이미 있다: `frontend/src/features/mobile/MobileNotificationsPage.tsx` 의 `toMobilePath()`
  - `/leaves*` → `/m/leaves`
  - `/project-documents*`, `/documents*`, `/approval*`, `/proposals*` → `/m/approvals`
  - `/notices*` → `/m/notices`, `/schedule*` → `/m/schedule`
  - 그 외 → `null`
- 따라서 **서버가 푸시 `data.link` 에 PC 경로를 그대로 넣어도 되고**(앱 쪽에서 변환), 서버에서 변환해도 된다. **어느 쪽이든 한 곳에서만 변환한다.**
- 권장: 서버는 `Notification.link` 원본을 `data.link` 로 보내고, 5-3의 탭 처리에서 `toMobilePath()` 를 재사용한다 (중복 구현 방지). `toMobilePath` 를 `features/mobile/` 의 공용 모듈로 빼서 양쪽이 import 하게 한다.
- `null` 이 나오면(알 수 없는 경로) `/m/notifications` 로 보낸다.

### 4-2. 알림 생성 지점은 `approval_notice.py` 한 곳
- `Notification(` 을 직접 만드는 곳은 `backend/app/services/approval_notice.py` 의 함수 3개뿐이다(`db.add` 만 하고 커밋은 호출처가 한다). 호출처는 `routers/documents.py`, `leaves.py`, `project_documents/approval.py`, `proposals/*` 등 여러 곳.
- 그러므로 원본 4-6의 권장안(SQLAlchemy `after_commit` 이벤트에서 **커밋된 알림에 대해서만** 발송)이 맞다. 커밋 전에 보내면 롤백된 알림이 폰에 뜬다.
- 이후 `Notification` 을 만드는 코드가 추가돼도 같은 경로를 타는지 `grep -rn "Notification(" backend/app` 로 확인한다.

### 4-3. 메신저는 Notification 을 만들지 않는다
- 메신저(`routers/messenger*.py`, `services/messenger.py`) 메시지는 `Notification` 테이블을 쓰지 않는다. 즉 **4-6 방식으로는 메신저 푸시가 가지 않는다.**
- 이번 범위(결재·연차 등 `Notification` 기반)에는 포함하지 않는다. 메신저 푸시는 별도 작업으로 분리한다(필요하면 메신저 전송 지점에서 `send_push` 를 직접 호출하는 방식). **범위를 담당자와 먼저 합의할 것.**

### 4-4. 마이그레이션 번호
- (구현 시점 head 는 `0030_card_owner_delegates` 라 실제 번호는 `0031_device_tokens`) 문서 작성 때 head 는 `0028_contacts` 였다(`backend/alembic/versions/` 에서 확인). 새 마이그레이션은 `0029_device_tokens` 로 만든다.
- **다른 담당자가 먼저 0029 를 쓰고 있지 않은지 확인**하고, 겹치면 번호를 올린다. 서버는 시작 시 구조를 바꾸지 않으므로 배포 때 `alembic upgrade head` 를 반드시 실행한다.

### 4-5. Docker 환경
- `backend/secrets/` 는 git 에 없으므로 **이미지 빌드(`COPY`)로는 들어가지 않는다.** 볼륨 마운트로 연결하거나 컨테이너에 직접 둔다.
- `.env` 의 `FCM_CREDENTIALS_PATH` 는 **컨테이너 안에서 보이는 경로**여야 한다.
- 컨테이너에서 `fcm.googleapis.com`, `oauth2.googleapis.com` 으로 나가는 HTTPS 가 막혀 있지 않은지 확인한다.

## 5. 구현할 것 (요약 — 상세 설계는 원본 4~5단계)

### 5-A. 백엔드 (원본 4-1 ~ 4-7)
1. `firebase-admin` 설치, `requirements.txt` 에 버전 고정 추가
2. `config.py` 에 `fcm_credentials_path` (기본 빈 값 = 푸시 꺼짐), `.env` 에 `FCM_CREDENTIALS_PATH`
3. `models/device_token.py` + 마이그레이션 `0029` (`token` unique, 계정 전환 시 `user_id` 갱신)
4. `routers/push.py`: `POST /api/push/devices`(upsert), `DELETE /api/push/devices`(본인 토큰만), `main.py` 에 등록
5. `services/push.py`: 앱 시작 시 한 번 초기화, `send_push(...)`, 무효 토큰 삭제, **예외 전파 금지**, 백그라운드 발송
6. `Notification` 커밋 후 자동 발송 연결 (§4-2)
7. 테스트: 토큰 API(권한·중복·계정 전환), 발송 서비스(FCM mock: 토큰 없음 / 무효 토큰 삭제 / 예외 비전파)

### 5-B. 프론트 `/m` (원본 5-1 ~ 5-4)
1. `frontend/src/lib/push.ts`: `registerPush()`, `unregisterPush()`
2. 로그인 후 `/m` 진입 시 등록, 로그아웃 시 해제
3. `notificationActionPerformed` 리스너로 탭 시 이동 (§4-1의 변환 사용)
4. `tokenReceived` 리스너로 토큰 갱신 시 재등록

> 주의: 원본 5-1 의 예시 코드는 골격이다. 네이티브 플러그인은 **`window.Capacitor.Plugins.FirebaseMessaging`** 으로 호출하며, 일반 브라우저에는 없으므로 존재 확인 후 호출한다. 서버가 `/m` 을 내려보내는 구조라 **프론트 빌드·배포만으로 앱에 반영**된다(앱 재설치 불필요).

## 6. 프로젝트 규칙 (CLAUDE.md 에서 — 꼭 지킬 것)

- **디버그 메시지**: 백엔드는 `logger.debug("[Push] ...")`, 프론트는 `console.debug("[Push] ...")` 형태로 요청 진입/결과/에러 지점마다 붙인다. 토큰은 **앞 8자만** 로그에 남긴다.
- **푸시 실패가 본 업무를 막으면 안 된다.** 결재·연차 처리 중 예외가 나도 업무 응답은 정상이어야 한다.
- **푸시 본문에 민감 정보(금액·개인정보) 금지.** 잠금 화면에 보인다. "결재 요청이 도착했습니다" 수준으로.
- **커밋 규칙**: 커밋 전에 버전 번호를 사용자에게 묻고 `[V.0.72.xxx] feat(scope): 설명` 형식으로 쓴다. 버전을 올리면 `cd desktop && npx tsx scripts/bump-version.ts V.x.xx.xxx` 후 루트 `CHANGELOG.md` 에 항목을 적는다(`docs/version-policy.md`).
- **DB 변경은 alembic 으로만** 한다.

## 7. 알아둘 제한·후속 작업

| 항목 | 내용 |
|---|---|
| 프로덕션 APNs 키 | Firebase 의 **프로덕션 APNs 인증 키 칸이 비어 있다.** Xcode 로 직접 설치한 개발 빌드는 지금 설정으로 되지만, **TestFlight/App Store 빌드는 프로덕션 키가 있어야 푸시를 받는다.** 같은 `.p8`(Key ID·Team ID 동일)을 프로덕션 칸에도 올리면 된다. 키 파일은 이 담당자에게 따로 전달 필요 |
| 푸시 권한 팝업 | 아직 뜨지 않는다. 5단계의 `registerPush()` 가 호출될 때 처음 뜬다 |
| Firebase 콘솔 테스트 | 5단계로 토큰을 얻으면, 콘솔 **Messaging → 새 캠페인 → 테스트 메시지**에 토큰을 넣어 **앱 쪽만 먼저 검증**할 수 있다 |
| 네이티브 변경 | 서버·`/m` 화면 변경은 앱 재설치가 필요 없다. 앱 네이티브 설정(plist·capability)을 바꿀 때만 재설치 |
| 안드로이드 | 이번 범위 아님(원본 7단계). 서버는 `platform` 컬럼만 두면 이후 변경이 없다 |

## 8. 앱 쪽에서 이미 해 둔 것 (참고)

- `mobile/` 에 `@capacitor-firebase/messaging`(8.6.0), `firebase` 설치. Swift Package Manager 로 연결됨(CocoaPods 아님)
- `mobile/capacitor.config.ts`: `FirebaseMessaging.presentationOptions = ["badge","sound","alert"]`(앱이 열려 있어도 배너 표시), SPM 이름 충돌 방지 옵션
- `mobile/ios/App/App/AppDelegate.swift`: 푸시 토큰 등록·실패·알림 수신을 플러그인에 전달하는 코드 3개 추가. (`FirebaseApp.configure()` 는 플러그인이 스스로 호출하므로 넣지 않음)
- Xcode: `GoogleService-Info.plist` 를 App 타깃에 등록, Push Notifications·Background Modes(Remote notifications) 추가. `App.entitlements` 의 `aps-environment` 는 `development`(배포 빌드에서는 Xcode 가 자동으로 `production` 으로 바꿈)
- 앱 재빌드 시 `npx cap sync ios` 를 쓴다. 서버 주소는 기본값(`https://www.epik.bio`)이 들어가며 다른 주소는 `CAP_SERVER_URL=https://주소` 로 지정. 자세한 절차는 `mobile/README.md`
- 빌드 시 Firebase 플러그인 코드의 `deprecated` 경고 2건이 나오지만 **무시해도 된다**(플러그인 내부 코드)

## 9. 완료 확인 (원본 6-1 에서 핵심만)

1. 앱에서 로그인 → `device_tokens` 에 행이 생긴다 (서버 로그 `[Push] 토큰 등록`)
2. 연차·문서 결재 요청/승인 → 대상 직원 폰에 푸시가 온다 (포그라운드/백그라운드/종료 상태 각각)
3. 푸시를 탭하면 해당 `/m` 화면으로 이동한다
4. 로그아웃 후 같은 폰에 푸시가 오지 않는다
5. A 로 쓰던 폰에서 B 로 로그인 → A 알림이 이 폰에 오지 않는다
6. 앱 삭제 후 발송 → 서버가 무효 토큰을 정리한다 (로그 확인)
7. 서비스 계정 JSON 이 없거나 경로가 비어 있어도 서버가 정상 기동하고 알림은 기존처럼 앱 안에서만 보인다

## 10. 문의·확인할 사람

- Apple/Firebase 계정·키 관련(프로덕션 키 업로드, 키 재발급): 앱 담당자
- 서버 배포·도커·`.env`: 서버 담당자
- 메신저 푸시 포함 여부(§4-3), `0029` 번호 충돌(§4-4): 시작 전에 양측이 합의
