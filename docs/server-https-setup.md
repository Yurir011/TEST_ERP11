# 서버 HTTPS 설치 안내 (서버 담당자용)

> ⚠ **2026-11-04 확인 결과: 이 문서의 방법(서버 PC 에 Caddy 설치)은 지금 그대로 쓸 수 없다.**
> `www.epik.bio`(공인 IP 1.224.24.212)의 80·443 포트는 **이미 다른 서버**(Ubuntu nginx + API 게이트웨이, 인증서는 `1-224-24-212.sslip.io` 용)가 쓰고 있다. 그래서 `https://www.epik.bio` 를 열면 브라우저가 "연결이 비공개로 설정되어 있지 않습니다"를 보여 준다. ERP 는 3102 포트(nginx, 빌드된 화면)로 따로 서비스 중이다.
> 80·443 을 그 서버가 계속 써야 한다면, 그 서버에 ERP 용 주소(예: `erp.epik.bio`)를 추가하는 방법을 택해야 한다. 방향이 정해질 때까지 이 문서의 1~8단계는 **실행하지 않는다.**

> 목표: 직원이 사무실 밖에서 폰으로 `https://www.epik.bio` 에 접속하고, 지문·얼굴(패스키)로 로그인하게 만든다.
> 방법: 서버 PC 에 **Caddy**(HTTPS 문지기)를 설치한다. 인증서는 Caddy 가 자동으로 받고 갱신한다.
> 걸리는 시간: 30분~1시간. 언제든 **Caddy 를 끄고 공유기 80·443 설정을 지우면 원래대로** 돌아간다. 지금 쓰는 `http://www.epik.bio:3102` 는 그대로 동작한다.

```
직원 폰 ──https://www.epik.bio──> (공유기 443) ──> Caddy ──> ERP 서버(화면 5173 → 백엔드 8000)
직원 PC 앱 ──http://www.epik.bio:3102──> (공유기 3102) ──────────> ERP 서버   ← 그대로 유지
```

## 0. 준비물
- 서버 PC 에서 관리자 권한으로 명령 프롬프트를 열 수 있어야 한다.
- 공유기 관리 화면(포트포워딩)에 들어갈 수 있어야 한다. (지금 3102 를 열어 둔 곳과 같은 화면이다.)
- 인터넷에서 `www.epik.bio` 가 이 사무실의 공인 IP 를 가리켜야 한다. (3102 로 밖에서 접속된다면 이미 맞다.)

## 1. 쓸 주소를 확인한다
**`www.epik.bio` 를 그대로 쓴다.** 도메인 DNS 를 바꿀 필요가 없다.

단, 먼저 **다른 곳에서 이 주소의 80/443 포트를 이미 쓰고 있지 않은지** 확인한다.
- 폰의 Wi-Fi 를 끄고(LTE) 브라우저에서 `http://www.epik.bio` 와 `https://www.epik.bio` 를 열어 본다.
  - **"연결할 수 없음"** 이 나오면 비어 있는 것이다. 다음 단계로 간다.
  - **다른 웹사이트(회사 홈페이지 등)가 나오면 여기서 멈춘다.** 그 주소의 80/443 은 이미 다른 용도다. 새 하위 주소(`erp.epik.bio` 등)가 필요하고, 그러려면 `epik.bio` 의 DNS 를 관리하는 곳(도메인 업체)에서 주소를 하나 추가해야 한다.

## 2. 안쪽 포트를 확인한다 (Caddy 가 어디로 전달할지)
서버 PC 에서 명령 프롬프트에 입력한다.
```
netstat -ano | findstr LISTENING | findstr ":3102 :5173 :8000"
```
- `:5173` 이 보이면 화면 서버(Vite)가 떠 있는 것이다. 공유기에서 3102 가 서버 PC 의 5173 으로 연결돼 있을 가능성이 크다.
- 공유기의 3102 포트포워딩 화면에서 **"내부 포트"** 가 몇 번인지 확인한다.
  - 5173 → `deploy/Caddyfile` 을 **그대로** 둔다.
  - 3102 → `deploy/Caddyfile` 의 `reverse_proxy 127.0.0.1:5173` 을 `reverse_proxy 127.0.0.1:3102` 로 바꾼다.
  - 그 밖의 번호 → 그 번호로 바꾼다.

## 3. 80·443 포트가 비어 있는지 확인한다
```
netstat -ano | findstr LISTENING | findstr ":80 :443"
```
- **아무것도 안 나오면** 비어 있다.
- 뭔가 나오면 이미 다른 프로그램(IIS, 다른 웹서버 등)이 쓰고 있다. 맨 오른쪽 숫자(PID)로 `tasklist /FI "PID eq 숫자"` 를 쳐서 어떤 프로그램인지 확인하고, 그 프로그램이 꼭 필요한지 정한 뒤 진행한다.

## 4. 공유기에서 포트를 연다
공유기 포트포워딩에 다음 두 개를 **추가**한다. (3102 는 건드리지 않는다.)

| 외부 포트 | 내부 IP | 내부 포트 | 종류 |
|---|---|---|---|
| 80 | 서버 PC 의 내부 IP (3102 와 같은 주소) | 80 | TCP |
| 443 | 서버 PC 의 내부 IP | 443 | TCP |

80 번은 인증서를 받고 갱신할 때 필요하다. 닫아 두면 인증서 갱신이 실패한다.

## 5. Windows 방화벽에서 허용한다
**관리자 권한 명령 프롬프트**에서 한 번 입력한다.
```
netsh advfirewall firewall add rule name="BENCH Caddy HTTP/HTTPS" dir=in action=allow protocol=TCP localport=80,443
```

## 6. Caddy 를 내려받는다
1. https://caddyserver.com/download 에서 **Windows amd64** 를 고르고 내려받는다.
2. 내려받은 파일 이름을 **`caddy.exe`** 로 바꿔 프로젝트의 **`deploy` 폴더**에 넣는다.
   (`deploy\caddy.exe` — 이 파일은 저장소에 올라가지 않도록 설정돼 있다.)

## 7. 실행한다
`deploy\start-caddy.bat` 을 더블클릭한다.
- 설정 검사가 통과하면 Caddy 가 켜지고, 처음에는 인증서를 받는 로그가 나온다. 이런 줄이 보이면 성공이다.
  `certificate obtained successfully` (또는 `certificate obtained`)
- 이 창을 닫으면 Caddy 가 꺼진다.
- 인증서를 받으려고 **같은 설정으로 반복해서 껐다 켜지 않는다.** (Let's Encrypt 는 짧은 시간에 여러 번 받으면 잠시 막는다.)

## 8. 확인한다
1. 폰 Wi-Fi 를 끄고(LTE) `https://www.epik.bio` 를 연다.
2. 주소창에 **자물쇠**가 보이고 로그인 화면이 나오면 성공이다.
3. 로그인이 되고, 모바일 화면(`/m`)이 열리는지 본다.
4. 직원 PC 앱이 예전 주소(`http://www.epik.bio:3102`)로 계속 접속되는지도 확인한다.

## 9. 패스키 설정을 켠다
1. `backend\.env` 맨 아래에 두 줄을 적는다. (`backend\.env.example` 에 예시가 있다.)
   ```
   WEBAUTHN_RP_ID=epik.bio
   WEBAUTHN_ORIGINS=["https://www.epik.bio"]
   ```
   - 첫 줄은 `https://` 와 `:포트` 없이 도메인만, 둘째 줄은 **대괄호와 큰따옴표**를 꼭 쓴다.
2. DB 백업(`backup.bat`) 후 DB 를 갱신한다.
   ```
   cd backend
   venv\Scripts\python.exe -m alembic upgrade head
   venv\Scripts\python.exe -m pip install -r requirements.txt
   ```
3. **백엔드와 화면 서버를 모두 껐다 켠다.** 화면 서버를 다시 켜야 접속자 주소 전달 설정(`xfwd`)이 적용된다.
4. 브라우저에서 `https://www.epik.bio/api/passkeys/status` 를 열어 `{"enabled":true}` 가 나오는지 본다. `false` 면 두 줄의 오타를 확인한다.
5. 서버를 다시 켠 뒤, 감사 로그(설정 → 감사 로그)에서 새로 생기는 접속 주소가 `127.0.0.1` 이 아닌 **실제 주소**로 찍히는지 확인한다.

## 10. 서버를 켤 때마다 Caddy 가 자동으로 켜지게 하기 (선택)
수동으로 잘 되는 것을 확인한 뒤에 한다. **관리자 권한 명령 프롬프트**에서 한 번 입력한다. (경로는 실제 위치로 바꾼다.)
```
schtasks /Create /TN "BENCH Caddy" /TR "\"C:\Repo\Python\GUI_STUDY\11\deploy\start-caddy.bat\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
```
- 등록한 뒤 서버 PC 를 한 번 다시 시작해서 `https://www.epik.bio` 가 열리는지 확인한다.
- 자동 시작은 시스템 계정으로 돌기 때문에 인증서를 새로 한 번 받는다. 정상이다.
- 지우려면: `schtasks /Delete /TN "BENCH Caddy" /F`

## 문제가 생기면
| 증상 | 확인할 것 |
|---|---|
| Caddy 로그에 `challenge failed` / `timeout` | 공유기 80·443 포트포워딩, Windows 방화벽, 인터넷에서 `www.epik.bio` 가 이 사무실 IP 를 가리키는지 |
| `bind: Only one usage of each socket address` | 80/443 을 다른 프로그램이 쓰는 중 (3단계 확인) |
| 브라우저에 `502 Bad Gateway` | 안쪽 서버가 꺼져 있거나 `Caddyfile` 의 포트가 틀림 (2단계), 화면 서버(Vite)가 떠 있는지 |
| 브라우저에 `Blocked request. This host is not allowed` | 화면 서버(Vite)가 `www.epik.bio` 를 막는 중. `frontend/vite.config.ts` 의 `server` 에 `allowedHosts: ['www.epik.bio']` 를 추가한다 |
| 로그인 화면은 뜨는데 [지문·얼굴로 로그인] 버튼이 없다 | `/api/passkeys/status` 가 `true` 인지, 폰 브라우저 주소가 `https://` 인지, `.env` 수정 후 백엔드를 다시 켰는지 |
| 한 사람이 틀렸는데 직원 전체가 로그인이 막힌다 | 접속자 주소 전달이 안 된 것. 화면 서버를 다시 켰는지, 감사 로그의 접속 주소가 모두 `127.0.0.1` 인지 확인 |

## 되돌리기
1. `start-caddy.bat` 창을 닫는다 (또는 자동 시작을 지운다).
2. 공유기에서 80·443 포트포워딩을 지운다.
3. `.env` 의 `WEBAUTHN_*` 두 줄은 남겨 두어도 된다 (HTTPS 로 접속하지 않으면 패스키 버튼이 나오지 않는다).

## 알아 둘 점
- 지금 서버는 화면을 **Vite 개발 서버**로 내보내고 있는 것으로 보인다(저장소의 실행 방식이 그렇다). 외부에 공개하는 서버로는 `npm run build` 로 만든 파일을 Caddy 가 직접 내보내는 방식이 더 안정적이고 안전하다. 이는 배포 절차가 바뀌는 별도 작업이라 이번에는 하지 않았다.
- 직원 PC 앱의 기본 서버 주소(`http://www.epik.bio:3102`)를 `https://www.epik.bio` 로 바꾸는 것은 새 설치 파일이 필요하다. 폰 접속이 안정된 뒤에 별도로 진행한다.
