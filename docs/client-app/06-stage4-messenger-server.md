# 4단계 — 메신저 서버

> 2026-10-17 · 승인: DB 표 추가(리비전 0008) · 새 패키지 없음 · 코드: `backend/`

## DB (Alembic `0008_messenger`) — 새 표 4개만 추가, 기존 표는 바꾸지 않음
| 표 | 내용 |
|---|---|
| `conversations` | 종류(direct/group), 그룹 이름, `direct_key`(1:1 은 두 사람 사이에 하나만: 유일), 마지막 메시지 시각 |
| `conversation_members` | 참여자, 나간 시각(`left_at`: 행은 남겨 다시 초대 가능), 읽은 위치(`last_read_message_id`), 알림 끔 |
| `messages` | 번호(bigint), 대화방, 보낸 사람(직원이 지워져도 메시지는 남음), 본문, `client_msg_id`(같은 사람·같은 값이면 한 번만 저장) |
| `message_attachments` | 원래 파일 이름, 서버 저장 경로, 크기, 확인된 형식 |

개발 DB 적용: 백업(`erp_db_20261017_112013_before_messenger_tables.dump`) 후 0007 → 0008, 새 표 0행, 기존 직원 8명 그대로. 테스트 DB 에서 down → up 도 확인.

## API (`/api/messenger`, 로그인한 모든 직원)
| API | 내용 |
|---|---|
| `GET /users` | 대화 상대로 고를 직원(활성, 나 제외). 이름·직급·직책만 |
| `GET /conversations`, `GET /conversations/{id}` | 내 대화방(최근 대화 순) + 마지막 메시지 + 안 읽은 수. 대화방이 몇 개든 쿼리 수 고정(N+1 없음) |
| `POST /conversations` | 1:1(있으면 그것을 돌려줌 200, 없으면 만듦 201) / 그룹(이름 필수, 나 빼고 2명 이상, 최대 50명) |
| `POST /conversations/{id}/members`, `DELETE …/members/me` | 그룹 참여자 추가 / 나가기 (1:1 은 불가). 새로 들어온 사람은 이전 내용을 볼 수 있지만 "안 읽음"으로 쌓이지 않음 |
| `GET …/messages?before_id=&limit=` | 50개씩 이전 메시지(오래된 것부터 돌려줌), `has_more` |
| `GET …/messages?after_id=` | 다시 연결했을 때 놓친 메시지 |
| `POST …/messages` | 보내기 (본문 1~4000자). 같은 `client_msg_id` 로 다시 보내도 한 번만 저장(200) |
| `POST …/attachments` | 파일 1개 + 설명(선택). 20MB까지, 파일 앞부분으로 실제 형식 확인(이미지·PDF·오피스·zip·txt), 저장 이름은 서버가 정함 |
| `GET /attachments/{id}` | 참여자만. 이미지·PDF 는 화면에서 바로, 나머지는 다운로드로. `nosniff` |
| `PUT …/read` | 읽은 위치 기록(뒤로 가지 않음, 다른 대화방 메시지는 400) |
| `GET /unread-count`, `PUT …/mute` | 전체 안 읽은 수(사이드바 배지), 내 알림 끄기 |

### 접근 권한
- **대화방의 현재 참여자만** 접근한다. 참여자가 아니거나 나간 사람, 없는 대화방은 모두 같은 404 (대화방이 있는지도 알 수 없음). **대표·사이트 관리자도 남의 대화는 볼 수 없다** — 테스트로 모든 엔드포인트(조회·보내기·첨부·읽음·참여자·나가기·첨부 다운로드)를 확인.
- 변경 이력(감사 로그)에는 **대화방 만들기·참여자 추가·나가기만** 남긴다. **메시지 본문·첨부 파일 이름은 남기지 않고** 디버그 로그에도 본문은 길이만 쓴다 (테스트로 확인).

## 실시간 알림 (`WS /api/ws`)
- 연결하면 5초 안에 `{"type":"auth","token":"…"}` 를 보내야 한다. 토큰을 주소에 넣지 않는다(로그에 남음). 틀리거나 늦으면 코드 4401 로 끊는다.
- 서버가 보내는 것: `message.created`, `conversation.read`, `conversation.updated`. **저장이 끝난 뒤에만**, 그 대화방의 현재 참여자 연결에만 보낸다(같은 사람의 여러 창 모두).
- 클라이언트는 30초쯤마다 `ping` → 서버가 토큰을 다시 확인하고 `pong`. 그 사이 계정이 비활성화됐거나 카드·기기가 중지됐으면 4401 로 끊는다.
- 보내기·읽음은 REST 로 한다(저장 성공을 응답으로 알 수 있음). 연결이 끊긴 동안 놓친 메시지는 `after_id` 로 받아 가므로 잃지 않는다.
- 연결 목록은 서버 메모리에 있다(프로세스 하나로 운영하는 전제, 로그인 실패 제한과 같음). 프로세스를 늘리면 PostgreSQL `LISTEN/NOTIFY` 등으로 바꿔야 한다.
- 개발 서버(Vite) 프록시에 `ws: true` 를 추가했다. 운영 Nginx 에는 `/api/ws` 에 `Upgrade`/`Connection` 헤더 설정이 필요하다(아래).

## 검증
| 항목 | 결과 |
|---|---|
| 백엔드 `pytest` | **370 passed** (기존 307 + 신규 63: REST 47, WebSocket 16) |
| 변형 확인 | 참여자 확인에서 "내 참여" 조건을 빼면 다수 실패, 나간 사람도 허용하면 해당 테스트 실패 → 접근 제어를 실제로 지키고 있음 |
| Alembic | 모델과 리비전 일치 테스트 통과, 테스트 DB 에서 down → up 확인 |
| **미확인** | 실제 브라우저·앱에서의 연결(5단계 화면에서 확인), 운영 Nginx 를 거친 WebSocket |

## 운영 서버(Docker) 배포 전
- 리비전 0008 이 있다: **운영 DB 를 `pg_dump` 로 백업**한 뒤 `alembic upgrade head`.
- Nginx 에 WebSocket 설정이 필요하다:
  ```
  location /api/ws {
      proxy_pass http://backend;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 3600s;
  }
  ```
- 첨부 파일은 `storage/messenger_attachments` 에 저장되며 기존 백업 스크립트(`--with-files`)에 자동으로 포함된다. Docker 로 옮기면 이 폴더가 볼륨으로 유지되는지 확인한다.
