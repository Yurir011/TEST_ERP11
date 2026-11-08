# 모바일 앱 푸시 알림(FCM) 절차서

> 대상: BENCH ERP 아이폰 앱(`mobile/`, Capacitor) + FastAPI 서버
> 목표: 결재 요청·결과 등 ERP 업무 알림(`notifications` 테이블)이 생기면 직원 폰에 푸시로 도착하게 한다.
> 방침: iOS 를 먼저 구현하되, 나중에 안드로이드 직원이 생겨도 **서버 코드는 그대로** 두고 앱 쪽만 추가하면 되도록 처음부터 FCM 으로 통일한다.

## 진행 체크리스트

- [x] 1단계 — 사전 준비: Apple 개발자 계정·APNs 키(.p8) (완료: 2026-11-08, Sandbox & Production 겸용 키)
- [x] 2단계 — Firebase 프로젝트·iOS 앱 등록·APNs 키 업로드·서비스 계정 키 (완료: 2026-11-08)
- [x] 3단계 — iOS 앱: 플러그인 설치·Xcode capability·plist (완료: 2026-11-08)
- [x] 4단계 — 백엔드: 설정·DB(device_tokens)·API·발송 서비스 (완료: 2026-11-08, V.0.73.001)
- [x] 5단계 — 프론트(`/m` 화면): 권한 요청·토큰 등록·알림 탭 처리 (완료: 2026-11-08, V.0.73.001)
- [x] 6단계 — 테스트·배포·운영 (완료: 2026-11-08, 실기기에서 업무 알림·메신저 푸시·앱 아이콘 숫자 확인, V.0.73.002. TestFlight/App Store 빌드 확인은 앱 담당자)
- [ ] 7단계(나중) — 안드로이드 추가

---

## 전체 구조

```
ERP 서버에서 알림 발생 (Notification 저장)
  → 서버가 Firebase Admin SDK 로 FCM 에 발송 요청
    → FCM → APNs(iPhone) / FCM(Android)
      → 폰에 푸시 표시 → 탭하면 앱이 열리고 해당 화면(link)으로 이동
```

- 서버 → Google(FCM) 은 **아웃바운드 HTTPS** 라서 사내 서버에 HTTPS 설정이 없어도 된다. 단, 서버가 인터넷에 나갈 수 있어야 한다 (`fcm.googleapis.com`, `oauth2.googleapis.com` 허용).
- 푸시는 폰이 사내망 밖에 있어도 도착한다. 다만 알림을 탭해 `/m` 화면을 열려면 사내망(또는 VPN)이 필요하다.
- 시뮬레이터는 푸시 테스트가 불편하다. **실제 아이폰**으로 테스트한다.

---

## 1단계 — 사전 준비 (Apple)

### 1-1. 권한 확인
- Apple Developer Program(유료) 가입 완료.
- 로그인하는 Apple ID 가 **Account Holder** 또는 **Admin** 이어야 키를 만들 수 있다.
- 한 계정에 APNs 키는 최대 2개.

### 1-2. App ID 에 Push 켜기
1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles → Identifiers**
2. `kr.co.bench.erp` 선택 (없으면 `+` → App IDs → App, Bundle ID 는 **Explicit** 으로 `kr.co.bench.erp`)
3. Capabilities 에서 **Push Notifications** 체크 → **Save**

### 1-3. APNs 인증 키(.p8) 발급
1. **Keys → `+`**
2. Key Name: `BENCH ERP APNs`
3. **Apple Push Notifications service (APNs)** 체크, 환경은 **Sandbox & Production**
4. **Continue → Register**
5. **Download** → `AuthKey_XXXXXXXXXX.p8` 저장 (**이 화면에서 한 번만 받을 수 있다. 분실하면 키를 폐기하고 새로 발급**)

### 1-4. 적어 둘 값

| 항목 | 위치 |
|---|---|
| Key ID | 키 상세 화면 / .p8 파일명의 `XXXXXXXXXX` |
| Team ID | 계정 우측 상단 또는 **Membership details** |
| Bundle ID | `kr.co.bench.erp` |

### 1-5. 보관
- `.p8` 은 **git 에 올리지 않는다.** 프로젝트 밖의 안전한 곳(비밀번호 관리자·암호화 백업)에 둔다.

---

## 2단계 — Firebase 설정

### 2-1. 프로젝트 생성
1. https://console.firebase.google.com → **프로젝트 추가**
2. 이름 `bench-erp` (자유), Google Analytics 는 **끈다** (푸시에 불필요)

### 2-2. iOS 앱 등록
1. 프로젝트 개요 → **iOS+** 아이콘
2. **Apple 번들 ID**: `kr.co.bench.erp` (한 글자라도 다르면 푸시가 오지 않는다)
3. 앱 닉네임: `BENCH ERP iOS`
4. **`GoogleService-Info.plist` 다운로드**
5. 이후 "Firebase SDK 추가 / 초기화 코드" 안내는 **건너뛴다** (Capacitor 방식으로 3단계에서 처리)

### 2-3. APNs 키 업로드
1. 톱니바퀴 → **프로젝트 설정 → 클라우드 메시징**
2. **Apple 앱 구성 → APNs 인증 키 → 업로드**
3. `.p8` 파일, **Key ID**, **Team ID** 입력

### 2-4. 서버용 서비스 계정 키
1. **프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성** → JSON 다운로드
2. 서버에서만 사용. **git 금지.** 예: `backend/secrets/firebase-service-account.json`
3. Firebase 프로젝트 ID 도 적어 둔다 (JSON 안의 `project_id`).

### 2-5. 준비물 점검

| 파일 | 쓰이는 곳 |
|---|---|
| `AuthKey_XXXXXXXXXX.p8` | Firebase 에 업로드한 뒤 안전한 곳에 보관 (서버에 두지 않음) |
| `GoogleService-Info.plist` | iOS 앱 (`mobile/ios/App/App/`) |
| `firebase-service-account.json` | 백엔드 서버 |

### 2-6. `.gitignore` 추가
```
# FCM 푸시: 서비스 계정 키·APNs 키·Firebase 앱 설정은 저장소에 올리지 않는다
/backend/secrets/
*.p8
GoogleService-Info.plist
google-services.json
```

---

## 3단계 — iOS 앱 (mobile/)

앱은 서버의 `/m` 화면을 WKWebView 로 여는 껍데기다. 푸시 권한 요청·토큰 발급은 **네이티브 플러그인**이 하고, 화면(JS)이 그 플러그인을 호출한다. 네이티브 변경이므로 **앱을 다시 빌드해 폰에 설치**해야 한다.

### 3-1. 플러그인 선택
`@capacitor-firebase/messaging` 을 쓴다.
- 공식 `@capacitor/push-notifications` 는 iOS 에서 **APNs 토큰**을 돌려줘서 FCM 으로 보낼 수 없다(추가 네이티브 코드 필요). 반면 이 플러그인은 iOS·Android 모두 **FCM 토큰**을 돌려준다.
- 현재 앱은 Swift Package Manager(`ios/App/CapApp-SPM`) 구성이다. 설치 전 플러그인의 최신 문서에서 **Capacitor 8 / SPM 지원 여부**를 확인한다. 지원하지 않으면 CocoaPods 방식으로 전환해야 한다(맥에 CocoaPods 필요).

### 3-2. 설치
```bash
cd mobile
npm install @capacitor-firebase/messaging firebase
CAP_SERVER_URL=http://서버주소:3102 npx cap sync ios
```

### 3-3. `capacitor.config.ts` 에 플러그인 옵션 추가
앱이 **열려 있을 때도** 배너·소리로 알림이 보이게 한다.
```ts
const config: CapacitorConfig = {
  // ...기존 설정...
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};
```

### 3-4. `GoogleService-Info.plist` 넣기
1. `mobile/ios/App/App/` 에 복사
2. Xcode(`npx cap open ios`)에서 **App 그룹에 드래그**, **Copy items if needed** 체크, Target `App` 체크
   (파일만 복사하면 빌드에 포함되지 않는다)

### 3-5. Xcode capability
App 타깃 → **Signing & Capabilities → `+ Capability`**
- **Push Notifications**
- **Background Modes** → **Remote notifications** 체크

(Signing 은 Automatically manage signing + Team 선택. Entitlements 의 `aps-environment` 는 자동으로 들어간다.)

### 3-6. AppDelegate 에 Firebase 초기화 (플러그인 문서의 iOS 단계 따름)
플러그인 문서 기준으로 `AppDelegate.swift` 에 `FirebaseApp.configure()` 와 푸시 토큰 전달(`didRegisterForRemoteNotificationsWithDeviceToken` 등) 코드를 추가한다. 버전마다 요구가 다르므로 **설치한 버전의 README 를 그대로 따른다.**

### 3-7. 빌드·설치
1. 실제 아이폰 연결 → Run
2. 첫 실행 시 알림 권한 팝업은 5단계의 화면 코드가 띄운다(앱 시작만으로는 뜨지 않음).

### 3-8. 확인
- Xcode 로그에 에러(`Firebase ... not configured`, `no valid aps-environment`) 가 없는지 본다.
- 다음 단계 전에 **Firebase 콘솔 → Messaging → 새 캠페인 → 테스트 메시지**로 토큰을 직접 넣어 보내면 앱 쪽만 먼저 검증할 수 있다(토큰은 5단계 이후 로그에서 확인).

---

## 4단계 — 백엔드

> 모든 코드에는 CLAUDE.md 규칙대로 `[Push] ...` 프리픽스 디버그 로그를 붙인다.

### 4-1. 패키지
`backend/requirements.txt` 에 추가 후 설치:
```
firebase-admin==<설치 시점 최신 안정 버전>
```
```bash
cd backend
./venv/Scripts/python.exe -m pip install firebase-admin
```
(운영 서버도 같은 패키지를 설치해야 한다.)

### 4-2. 설정 (`backend/app/config.py` + `backend/.env`)
```python
# FCM 푸시. 서비스 계정 JSON 경로가 비어 있으면 푸시 기능은 꺼진다(알림은 기존처럼 앱 안에서만 보인다).
fcm_credentials_path: str = ""
```
```
# backend/.env
FCM_CREDENTIALS_PATH=secrets/firebase-service-account.json
```

### 4-3. DB — `device_tokens`
모델 `backend/app/models/device_token.py`:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| user_id | FK users.id (CASCADE), index | 이 폰의 주인 |
| token | String(512), **unique** | FCM 토큰 |
| platform | String(10) | `ios` / `android` |
| device_name | String(100), null | 예: 아이폰 15 |
| app_version | String(20), null | 앱 버전 |
| last_seen_at | DateTime | 앱이 토큰을 마지막으로 등록한 시각 |
| created_at | DateTime | |

- 한 직원이 폰·태블릿 여러 대를 쓸 수 있으므로 user 당 여러 토큰을 허용한다.
- 토큰은 unique: 같은 폰에서 계정을 바꿔 로그인하면 기존 행의 `user_id` 를 새 계정으로 **갱신**한다(이전 계정에 알림이 가지 않게).
- `app/models/__init__.py` 에 import 추가.

마이그레이션 (서버는 시작 시 구조를 바꾸지 않는다):
```bash
cd backend
./venv/Scripts/python.exe -m alembic revision -m "device_tokens" --rev-id 0031
# 생성된 파일(0031_device_tokens.py)의 upgrade/downgrade 를 작성
./venv/Scripts/python.exe -m alembic upgrade head
```
(문서 작성 때 head 는 `0028_contacts` 였고, 실제 구현은 `0031_device_tokens` 이다.)

### 4-4. API — `backend/app/routers/push.py` (`/api/push`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/push/devices` | 본문 `{token, platform, device_name?, app_version?}`. 로그인한 사용자 소유로 **upsert** |
| DELETE | `/api/push/devices` | 본문 `{token}`. 로그아웃 시 이 폰의 토큰 삭제 (남의 토큰은 삭제 불가) |

- `main.py` 에 `app.include_router(push.router)` 추가.
- 로그: `[Push] 토큰 등록: user_id=.., platform=..` (토큰 전체는 로그에 남기지 말고 앞 8자만).

### 4-5. 발송 서비스 — `backend/app/services/push.py`
- 앱 시작 시 한 번 `firebase_admin.initialize_app(credentials.Certificate(경로))`. 설정이 비어 있으면 건너뛰고 `[Push] FCM 비활성` 로그.
- `send_push(db, user_id, title, body, link)`:
  1. 해당 user 의 `device_tokens` 조회
  2. `messaging.send_each(...)` 로 발송. iOS 용 `apns` 옵션에 `sound="default"`, `badge`(안 읽은 알림 수) 지정
  3. `data` 에 `{"link": "/m/..."}` 를 넣는다 (탭 시 이동용)
  4. 결과에서 `UnregisteredError` / `InvalidArgument`(토큰 무효) 는 **해당 토큰 삭제**
  5. 모든 예외는 잡아서 로그만 남긴다 — **푸시 실패가 결재·연차 등 본 업무를 막으면 안 된다.**
- FCM 호출은 네트워크 I/O 라서 요청 처리 중에 직접 기다리지 않고 **백그라운드(스레드/`BackgroundTasks`)** 로 보낸다.

### 4-6. 알림 생성 지점에 연결
알림은 `app/services/approval_notice.py` 의 함수 등에서 `db.add(Notification(...))` 로 만들어지고, 호출처가 여러 곳(documents/leaves 등)이다. 호출처를 일일이 고치지 않고 **한 곳에서** 처리한다.

- 권장: SQLAlchemy 이벤트로 `Notification` 이 **커밋된 뒤**(`after_commit`) 방금 저장된 알림들에 대해 `send_push` 를 호출. 커밋 전에 보내면 롤백된 알림이 폰에 뜨는 문제가 생긴다.
- 대안: `Notification` 을 만드는 헬퍼 함수 안에서 "커밋 후 발송 목록"에 등록하고, 요청 종료 시점에 보낸다.
- 대상 확인: `Notification` 을 직접 생성하는 다른 위치(`grep -rn "Notification(" backend/app`)도 같은 경로를 타는지 확인한다.

### 4-7. 테스트 (`backend/tests/`)
- 토큰 등록/갱신/삭제 API (권한, 중복, 계정 전환)
- 발송 서비스: FCM 호출을 mock 으로 대체해 ① 토큰 없는 사용자 ② 무효 토큰 삭제 ③ 예외가 호출자에게 전파되지 않음 검증
- `tests/test_version.py` 는 버전 변경 시에만 영향.

---

## 5단계 — 프론트엔드 (`frontend/src/features/mobile/`)

앱은 서버가 내보내는 `/m` 화면을 연다. Capacitor 는 이 원격 화면에도 `window.Capacitor` 를 주입하므로, 별도 패키지 없이 `window.Capacitor.Plugins.FirebaseMessaging` 로 플러그인을 호출할 수 있다. 일반 브라우저(Safari/PC)에는 이 객체가 없으므로 **반드시 있는지 확인 후** 호출한다.

### 5-1. 모듈 `frontend/src/lib/push.ts` (예시 골격)
```ts
// 앱(Capacitor) 안에서만 동작. 브라우저에서는 아무 일도 하지 않는다.
const getPlugin = () => (window as any).Capacitor?.Plugins?.FirebaseMessaging;

export async function registerPush() {
  const fm = getPlugin();
  if (!fm) return;
  console.debug("[Push] 권한 확인 시작");
  const perm = await fm.requestPermissions();            // 최초 1회 iOS 권한 팝업
  if (perm.receive !== "granted") { console.debug("[Push] 권한 거부됨"); return; }
  const { token } = await fm.getToken();
  console.debug("[Push] 토큰 발급 성공");
  await api.post("/api/push/devices", { token, platform: "ios", app_version: ... });
}

export async function unregisterPush() { /* 로그아웃 시 DELETE /api/push/devices + fm.deleteToken() */ }
```
- iOS 가 아닌 환경 대비: `platform` 은 `Capacitor.getPlatform()` 값으로 보낸다.
- 토큰은 바뀔 수 있다 → `fm.addListener("tokenReceived", ...)` 에서 서버에 재등록.

### 5-2. 호출 시점
- **로그인 직후(모바일 `/m` 진입 시)**: `registerPush()` 실행. 권한 팝업을 앱 시작 즉시 띄우기보다 로그인 후 한 번 안내 문구와 함께 띄운다.
- **로그아웃 시**: `unregisterPush()` 로 이 폰이 다른 사람 알림을 받지 않게 한다.

### 5-3. 알림 탭 처리
```ts
fm.addListener("notificationActionPerformed", (e: any) => {
  const link = e.notification?.data?.link;
  console.debug("[Push] 알림 탭: link=", link);
  if (link) navigate(link);       // React Router 의 이동 함수
});
```
- 앱이 종료된 상태에서 탭해 시작된 경우에도 이 리스너가 동작하는지 테스트에 포함한다(로그인 상태가 확인된 뒤 이동하도록 순서 주의).

### 5-4. 서버 반영
화면은 서버에서 내보내므로 프론트 빌드·배포만 하면 앱에 즉시 반영된다. **네이티브 변경(3단계)만 앱 재설치가 필요.**

---

## 6단계 — 테스트·배포·운영

### 6-1. 단계별 테스트
1. **앱 단독**: Firebase 콘솔 "테스트 메시지"에 토큰을 넣어 발송 → 폰에 도착하는지 (포그라운드/백그라운드/종료 상태 각각)
2. **서버 → 폰**: 관리자 계정이 연차·문서 결재를 요청/승인 → 대상 직원 폰에 푸시가 오는지
3. **탭 이동**: 푸시 탭 → 해당 결재 화면으로 이동하는지
4. **로그아웃**: 로그아웃 후 같은 폰으로 푸시가 오지 않는지
5. **계정 전환**: A 로 로그인했던 폰에서 B 로 로그인 → A 알림이 이 폰에 오지 않는지
6. **무효 토큰**: 앱 삭제 후 발송 → 서버가 토큰을 정리하는지(로그 확인)

### 6-2. 운영 서버 배포 순서
1. `firebase-service-account.json` 을 운영 서버 `backend/secrets/` 에 복사하고 `.env` 에 `FCM_CREDENTIALS_PATH` 설정
2. `pip install -r requirements.txt`
3. `python -m alembic upgrade head` (0028~0031 적용, 푸시용은 0031_device_tokens)
4. 백엔드·프론트 배포 후 서버 재시작 → 로그에서 `[Push] FCM 초기화 완료` 확인
5. 직원 폰에 업데이트된 앱을 설치 (TestFlight 또는 Xcode 직접 설치 — `docs/mobile-external-release.md` 참고)

### 6-3. 운영 팁
- 로그 레벨은 `LOG_LEVEL` 환경변수로 제어한다. 문제 추적 시 `[Push]` 로그를 본다.
- 푸시 본문에는 **민감 정보(금액·개인정보)를 넣지 않는다.** 잠금 화면에 노출된다. "결재 요청이 도착했습니다" 수준으로 한다.
- 서비스 계정 JSON·.p8 키가 유출되면 Firebase/Apple 에서 키를 폐기하고 새로 발급한다.
- 버전은 커밋 규칙에 따라 올린다(`docs/version-policy.md`, `cd desktop && npx tsx scripts/bump-version.ts V.x.xx.xxx`, `CHANGELOG.md` 기재).

### 6-4. 문제 해결

| 증상 | 점검 |
|---|---|
| 토큰 발급 실패 | plist 가 App 타깃에 포함됐는지, Push capability 추가 여부, 실기기인지 |
| 콘솔 테스트는 오는데 서버 발송은 안 옴 | 서비스 계정 JSON 경로, 서버의 인터넷(아웃바운드) 허용, `device_tokens` 에 행이 있는지 |
| `APNs ... InvalidProviderToken` 류 오류 | Firebase 에 올린 .p8 의 Key ID·Team ID 확인 |
| 개발 빌드에서만/운영 빌드에서만 안 옴 | 키를 Sandbox & Production 겸용으로 만들었는지 |
| 앱을 켜 두면 안 보임 | `presentationOptions` 설정(3-3) |
| 알림 탭해도 이동 안 함 | `data.link` 값, 리스너 등록 시점, 로그인 상태 |

---

## 7단계 (나중) — 안드로이드 추가

서버(4단계)는 이미 FCM 이라 **변경이 없다.**
1. Firebase 콘솔에서 **Android 앱** 등록(패키지명 `kr.co.bench.erp` 권장) → `google-services.json` 다운로드
2. `cd mobile && npm install @capacitor/android && npx cap add android`
3. `google-services.json` 을 `mobile/android/app/` 에 복사
4. Android 13 이상은 알림 권한 팝업이 필요 — 같은 `requestPermissions()` 가 처리
5. `capacitor.config.ts` 의 `cleartext: true` 는 Android 에서 http 접속에 이미 대비되어 있음
6. 서버는 `platform=android` 토큰도 같은 `send_push` 로 발송 (Android 용 `notification channel`, `priority` 옵션만 추가)

---

## 참고
- Apple: APNs 인증 키 — https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
- Firebase: iOS 에서 클라우드 메시징 설정 — Firebase 공식 문서(Cloud Messaging → Apple 플랫폼)
- Capacitor Firebase Messaging 플러그인 README (설치한 버전의 문서가 정답)
- 이 프로젝트의 앱 구조: `mobile/README.md`, `docs/mobile-external-release.md`
