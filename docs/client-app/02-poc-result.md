# 0단계 PoC 결과 — PN532(CH340) 카드 읽기

> 2026-10-17 · 코드: `desktop/` (src/nfc, scripts/nfc-poc.ts)

## 확인한 것

| 항목 | 결과 | 방법 |
|---|---|---|
| 리더 인식 | CH340이 `COM3`(VID 1A86 / PID 7523)로 잡힘 | 장치 목록 + `SerialPort.list()` |
| PN532 통신 | **성공** — 115200bps, 깨우기 → SAM 설정 → 펌웨어 확인, 펌웨어 **1.6** | `npm run poc -- --init-only` (실제 장치) |
| Electron 안에서 `serialport` 로드 | **성공**, 다시 빌드할 필요 없음(미리 빌드된 N-API 파일 포함). Electron 44.5.1 / Node 24.21.0 | `scripts/electron-binding-check.js` |
| 프레임 해석·명령 처리·재연결 로직 | 자동 테스트 30건 통과 (가짜 장치) | `npm test` |
| **실제 카드 UID 읽기** | **미확인** — 카드를 대 보는 것은 직접 해야 한다 | 아래 방법 |

## 카드 읽기 직접 확인

```
cd desktop
npm run poc
```

카드(사원증 등)를 리더에 댔다 떼 보세요. `UID=…`, 바이트 수, `SAK` 값이 나옵니다. 사원증, 교통카드, 스티커 등 **가진 카드마다** 한 번씩 해 보고 결과(UID 바이트 수, SAK)를 알려 주세요. UID가 읽히지 않는 카드(보안 카드나 일부 교통카드는 매번 바뀌는 임의 UID를 보냄)가 있는지 확인하기 위한 것입니다.

또 `USB를 뽑았다 꽂기` → 몇 초 뒤 자동으로 `ready`가 되는지, 다른 프로그램이 COM3을 잡고 있으면 `busy`로 표시되는지도 확인합니다.

## 알게 된 점

- 이 PC의 셸에는 환경변수 `ELECTRON_RUN_AS_NODE=1`이 설정돼 있어서 `electron`을 그냥 실행하면 앱이 아니라 Node로 실행된다(`app`이 undefined). 1단계의 `npm start`, 테스트 스크립트에서는 이 변수를 지워서 실행한다(`env -u` / cross-env 방식).
- npm이 설치 스크립트를 막아서(`allowScripts`) Electron 실행 파일이 자동으로 받아지지 않았다. `node node_modules/electron/install.js`로 받았다. 설치 안내에 포함한다.
- 계획서의 `@electron/rebuild`는 필요 없다(N-API 미리 빌드). 계획서 §3.2의 "다시 빌드" 문구는 이 결과로 대체한다.
- 로그에는 UID 끝 4자리만 남긴다. PoC 화면(`npm run poc`)에는 확인을 위해 전체 UID를 출력한다.

## 1단계로 넘어가기 전 남은 것

- 위 카드 확인 결과(카드 종류별 UID 바이트 수).
- 결정 D1~D4(카드 단독/PIN, 승인된 PC 방식 등)는 2~3단계 전까지.

## 카드 확인 결과 (2026-10-17, 직접 확인)

| 카드 | UID | SAK | 종류 |
|---|---|---|---|
| A | 4바이트 | 0x08 | MIFARE Classic 1K |
| B | 4바이트 | 0x08 | MIFARE Classic 1K |
| C | 4바이트 | 0x88 | MIFARE Classic 1K (Infineon 계열) |

- 세 카드 모두 뗐다 다시 대도 **같은 UID**가 나온다(임의 UID 카드 아님) → 로그인에 쓸 수 있다. 카드끼리 UID가 서로 다르다.
- 같은 카드를 대고 있는 동안 감지 이벤트는 한 번만 나고, 떼면 `removed`, 다시 대면 새로 감지된다.
- 4바이트 UID의 MIFARE Classic은 복제가 쉬운 카드이므로, 계획서의 "승인된 PC에서만 카드 로그인"을 유지하고 PIN 추가 여부(D1)는 2단계 전에 정한다.
- USB를 뽑았다 꽂는 재연결은 자동 테스트(가짜 장치)로만 확인했다. 실제 뽑기는 1단계 앱에서 확인한다.
