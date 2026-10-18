# M0 — 사전 검증(PoC) 결과

> 2026-10-18 · 제품 코드 변경 없음, DB 변경 없음 · 가짜 서버만 사용(실제 메일 서버에는 접속하지 않음)
> 근거: [`02-implementation-plan.md`](./02-implementation-plan.md) M0

## 결론
**기술적으로 진행 가능하다.** 필요한 라이브러리가 Electron 44(Node 24.21)의 메인 프로세스에서 동작하고, 설치 파일과 같은 방식(electron-builder, `npmRebuild:false`, `asarUnpack`)으로 묶은 앱에서도 동일하게 동작했다. 다음스마트워크 실제 서버와의 호환만 **사람이 확인해야 한다**(아래 "미확인").

## 확인한 것
PoC 앱(임시 폴더, 제품과 분리)을 **개발 실행**과 **electron-builder 로 묶은 실행 파일** 두 방식으로 돌려 같은 7개 항목이 모두 통과했다.

| 항목 | 결과 |
|---|---|
| 실행 환경 | Electron 44.5.1, Node 24.21.0 |
| `better-sqlite3` 13.0.3 (+ FTS5 전문 검색, 한글) | 통과. 묶은 앱에서도 통과(`asarUnpack` 으로 `prebuilds/**` 를 꺼내 두면 로드됨) |
| `node:sqlite` (Node 내장, +FTS5) | 통과(네이티브 모듈 불필요) |
| `safeStorage` (Windows 암호화 저장소) | 사용 가능, 암호화→복호화 왕복 성공 |
| `nodemailer` 10.1.2 → 가짜 SMTP (한글 제목, 한글 이름 PDF 첨부) | 통과 |
| SMTP 인증 실패 감지 | 통과 (`EAUTH` 로 구분 가능) |
| SMTP 암호화 직접 접속(465 방식, `secure:true`) | 통과. 인증서 검증은 기본 켜짐(자체 서명 인증서는 거부됨 → 검증이 실제로 동작) |
| `imapflow` 2.5.2 + `mailparser` 3.9.40 → 가짜 IMAP (base64 HTML, 한글 발신자·제목) | 통과 |
| IMAP IDLE 새 메일 이벤트(`exists`) | 통과 (다른 연결이 메일을 추가하면 이벤트 수신) |

## 결정 (M1 에서 이대로 구현)
| 항목 | 결정 | 이유 |
|---|---|---|
| 로컬 저장소 | **`better-sqlite3` 13.0.3** | 성숙한 라이브러리, N-API 라서 Electron 버전 변경에도 안정적, 동기 API 라 저장소 코드가 단순. Windows 용 prebuilt 포함. `node:sqlite` 도 동작하나 Node 24 에서 아직 실험 단계 표시라 보류(대안으로 기록) |
| 설치 파일 설정 | `asarUnpack` 에 `node_modules/better-sqlite3/prebuilds/**` 추가, `files` 에서 다른 OS 용 prebuilds(`linux-*`, `linuxmusl-*`, `darwin-*`, `win32-arm64`) 제외 | 현재 serialport 와 같은 방식 |
| 메일 라이브러리 | `imapflow`, `mailparser`, `nodemailer` | 통과 |
| 비밀번호 저장 | `safeStorage` 로 암호화해 PC 에 저장. `isEncryptionAvailable()` 가 false 면 **저장 거부** | 평문 저장 금지 원칙 |
| 테스트용 가짜 서버(개발 의존성) | `smtp-server`(SMTP), `hoodiecrow-imap`(IMAP) | 둘 다 동작 확인. `hoodiecrow-imap` 은 이름이 `imapkit` 으로 바뀌었다는 안내가 있어 M1 시작 때 바뀐 패키지를 한 번 더 확인 |

## 주의할 점
- **새 의존성 추가는 M1 에서** 한다(M0 에서는 제품 `package.json` 을 바꾸지 않았다). 추가할 때 버전을 고정(`--save-exact`)하고 `npm audit` 결과를 기록한다.
- 이번에 설치한 버전은 모두 최근에 갱신된 패키지다. M1 시작 때 릴리스 시점과 취약점 보고를 다시 확인한다.
- `better-sqlite3` 는 모든 OS 용 prebuilt 를 함께 받는다. 설치 파일 크기 영향은 제외 설정으로 줄인다. 실제 크기는 M1 에서 설치 파일을 만들어 확인한다.

## 실제 서버 확인 결과 (2026-10-18, 로그인 없이 접속 정보만 조회)
사용자가 알려 준 정보: IMAP `imap.daum.net:993`(SSL), SMTP `smtp.daum.net:465`(SSL), **인증은 비밀번호 방식**. 같은 주소로 로그인 **없이** 암호화 연결과 기능 목록(CAPABILITY/EHLO)만 조회해 확인했다(비밀번호 입력·메일 접근 없음).

| 항목 | 확인된 값 | 의미 |
|---|---|---|
| TLS 인증서 | 두 서버 모두 정상(DigiCert, 인증서 검증 통과, 만료 2027-02-27) | 인증서 검증을 켠 채로 접속 가능. 2027-02 이후 갱신은 서버 쪽 일 |
| IMAP 인증 | `AUTH=PLAIN` (SASL-IR) | 비밀번호 방식 확인. **OAuth 없음 → 위험 해소** |
| IMAP 기능 | `IMAP4rev1`, `UIDPLUS`, `MOVE`, `NAMESPACE`, `ID`, `LITERAL+` | UID 증분 동기화·이동(`MOVE`) 사용 가능 |
| **IMAP `IDLE`** | **목록에 없음** | **새 메일 즉시 감지(IDLE)를 쓸 수 없다 → M3 에서 주기적 확인(폴링)으로 구현해야 함** |
| 없는 확장 | `CONDSTORE`/`QRESYNC`, `SPECIAL-USE`, `SORT`, `THREAD` 등 | 변경 감지는 UID/플래그 비교로, 폴더 역할(보낸/휴지통)은 이름·`LIST` 로 판단해야 함 |
| SMTP 인증 | `AUTH LOGIN PLAIN` | 비밀번호 방식 확인 |
| SMTP 최대 크기 | `SIZE 73400320` (약 70MB) | 첨부 합계 한도는 이 값 이하로 두고(여유를 두어 예: 20MB 안내) 메일 서비스 정책은 별도 확인 |
| 별칭 | `imap.hanmail.net`/`smtp.hanmail.net` 도 같은 서버 | 사용자가 알려 준 `daum.net` 주소를 쓴다 |

### 계획에 미치는 영향
- M3 "새 메일 감지(IDLE)" → **폴링(예: 앱이 켜져 있는 동안 1~2분마다 INBOX 신규 UID 확인)** 으로 변경. 연결 유지 비용·계정 차단 위험을 줄이려 간격은 설정값으로 두고 너무 짧게 하지 않는다.
- 폴더 역할: 서버가 `SPECIAL-USE` 를 알리지 않으므로 보낸편지함·휴지통 이름을 실제 계정의 `LIST` 결과로 확인해 매핑하고, 못 찾으면 사용자가 고르게 한다(M1 계정 설정 화면).
- 보낸 메일 저장(IMAP APPEND, `UIDPLUS` 있음)은 사용 가능. 다만 서버가 SMTP 발송분을 자동으로 보낸편지함에 저장하는지 실제 계정으로 확인해야 중복 저장을 피할 수 있다.

## 미확인 (사람이 확인해야 함)
1. **실제 로그인 성공 여부** — 일반 비밀번호로 되는지, 계정 설정에서 "외부 프로그램(IMAP/SMTP) 사용"을 켜야 하는지, 2단계 인증 계정은 앱 비밀번호가 필요한지. M1 의 연결 테스트 화면에서 확인한다(비밀번호는 앱 화면에만 입력).
2. 실제 계정의 폴더 이름(보낸편지함·휴지통), 한글 폴더명 인코딩.
3. 발송 한도(분당·일일), 서버의 보낸편지함 자동 저장 여부.
4. M1 개발은 가짜 서버로 먼저 시작할 수 있다.
