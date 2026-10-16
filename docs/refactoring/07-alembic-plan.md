# 07. DB 마이그레이션 체계(Alembic) 도입 계획

> 작성일: 2026-10-16 · 관련: [01-analysis.md](01-analysis.md) D1, [05-remaining-issues.md](05-remaining-issues.md) O6
> 상태: **전 단계 완료(2026-10-16)**. 1~4단계 결과는 8장, 5~7단계 결과는 9장.

## 1. 왜 필요한가

지금은 DB 구조를 이렇게 관리한다.

- 서버 시작 때 `Base.metadata.create_all()` — **없는 테이블만** 만든다. 기존 테이블에 컬럼을 추가하지는 못한다.
- 그래서 컬럼을 추가할 때마다 `backend/app/scripts/`에 1회성 스크립트를 만들어 왔다(**54개**). 그중 3개(`migrate_transaction_settlement`, `migrate_transaction_paid_amount`, `migrate_card_pending`)만 서버 시작 때 자동 실행되고, 나머지는 사람이 직접 실행해야 한다.
- **어느 DB에 어떤 스크립트가 적용됐는지 기록이 없다.**

이 방식의 위험은 운영 서버를 새로 만들 때 드러난다. 54개 스크립트 중 무엇을 어떤 순서로 돌려야 하는지 알 수 없어서, 개발 DB와 운영 DB의 구조가 조용히 달라질 수 있다. 앞으로 남은 작업(감사 로그, 품의서 결재 테이블 통합)이 모두 DB 구조 변경이라, 그 전에 변경 이력을 남기는 체계가 필요하다.

Alembic은 SQLAlchemy 공식 마이그레이션 도구다. 변경마다 "리비전" 파일을 남기고, DB에는 현재 어느 리비전까지 적용됐는지를 표(`alembic_version`)로 기록한다.

## 2. 현재 상태 조사 결과 (개발 DB `erp_db`, 읽기 전용)

| 항목 | 결과 |
|---|---|
| 테이블 | 모델 26개 + `approval_steps` = DB 27개. 컬럼 구성은 모델과 DB가 **모두 일치** |
| PostgreSQL enum 타입 | 22개 |
| 인덱스 | 36개 |
| 발견 | `app/models/__init__.py`가 `approval_step` 모델을 import 하지 않는다. 지금은 라우터가 먼저 import 해서 문제가 없지만, Alembic은 이 파일로 모델 목록을 읽으므로 **빠뜨리면 `approval_steps` 테이블을 지우는 리비전이 만들어질 수 있다.** 도입 첫 단계에서 고친다. |

컬럼이 일치하므로 "현재 DB = 현재 모델"을 기준점(baseline)으로 잡을 수 있다. 타입·기본값·제약 조건까지 같은지는 도입 단계에서 Alembic 비교로 다시 확인한다.

## 3. 도입 방식

### 3.1 기준점(baseline) 리비전
1. `alembic init` 으로 `backend/alembic/`과 `alembic.ini`를 만든다. DB 주소는 `.env`의 `DATABASE_URL`을 읽는다(비밀번호를 파일에 쓰지 않는다).
2. 현재 모델 전체로 첫 리비전 `0001_baseline`을 만든다(모든 테이블·enum·인덱스 생성).
3. **기존 DB(개발 `erp_db`, 나중에 운영 DB)는 리비전을 실행하지 않고 `alembic stamp 0001_baseline`으로 "여기까지 적용됨" 표시만 한다.** 데이터는 건드리지 않는다.
4. 새 DB(새 PC, 테스트 DB, 새 운영 서버)는 `alembic upgrade head`로 만든다.

### 3.2 서버 시작 절차
| 지금 | 도입 후 |
|---|---|
| 시작 때 `create_all` + 스크립트 3개 자동 실행 | 시작 때 **현재 리비전이 최신인지 확인만** 하고, 최신이 아니면 경고 로그(운영에서는 시작 거부)를 남긴다. 구조 변경은 하지 않는다 |
| 구조 변경 = 스크립트 직접 실행 | 구조 변경 = `alembic upgrade head` (start.bat 와 배포 절차에 한 줄 추가) |

서버가 시작할 때마다 스스로 DB 구조를 바꾸지 않게 하는 것이 핵심이다. 바꾸는 시점을 사람이 정하고, 바꾸기 전에 백업할 수 있어야 한다.

### 3.3 기존 스크립트 54개
삭제하지 않는다. `scripts/legacy_migrations/`로 옮기고 README에 "기준점 이전 이력, 실행하지 않음"이라고 적는다. 관리자 계정 생성 같은 비(非)마이그레이션 스크립트(`create_admin.py`, `create_site_admin.py`, `process_stamp.py`, `reconcile_client_balances.py`)는 그대로 둔다.

### 3.4 테스트
- 테스트 DB를 `create_all` 대신 `alembic upgrade head`로 만든다. 그러면 **리비전이 잘못되면 테스트가 실패**한다.
- "모델과 리비전이 일치하는지" 검사 테스트를 추가한다(Alembic 자동 비교 결과가 비어 있어야 통과). 모델만 바꾸고 리비전을 빠뜨리는 실수를 막는다.

## 4. 이후 구조 변경 작업 순서 (팀 규칙)

1. 모델 수정
2. `alembic revision --autogenerate -m "설명"` → 만들어진 파일을 **사람이 읽고 확인**
3. `pytest`(테스트 DB에 새 리비전 적용 + 일치 검사)
4. 개발 DB 백업(`pg_dump`) → `alembic upgrade head`
5. 커밋 (모델 + 리비전 파일 함께)

### 주의: PostgreSQL enum
Alembic 자동 생성은 **enum에 값을 추가한 것을 알아채지 못한다.** 직책·상태 같은 enum에 값을 더할 때는 리비전에 `ALTER TYPE ... ADD VALUE`를 직접 적어야 한다. 이 프로젝트는 enum이 22개라 자주 겪을 수 있는 함정이어서 4장 규칙 문서에 예시를 넣는다.

## 5. 위험과 대응

| 위험 | 대응 |
|---|---|
| 기준점이 실제 DB와 미묘하게 다름(기본값, 인덱스 이름, enum 이름) | stamp 전에 Alembic 비교를 개발 DB에 실행해 차이가 없음을 확인. 차이가 있으면 기준점 리비전을 실제 DB에 맞춘다 |
| `approval_steps`처럼 모델 등록 누락 | `models/__init__.py` 보완 + 일치 검사 테스트 |
| stamp 를 잘못된 DB에 실행 | stamp 는 표 한 줄만 쓰므로 데이터 손상은 없고, `alembic_version` 테이블을 지우면 되돌릴 수 있다 |
| 업그레이드 중 실패 | PostgreSQL은 구조 변경도 트랜잭션으로 묶여 실패 시 되돌아간다. 그래도 업그레이드 전 `pg_dump` 백업을 절차에 넣는다 |
| 서버 시작 시 자동 마이그레이션이 사라져 새 컬럼이 반영 안 됨 | 시작 때 리비전 확인 경고/거부로 바로 알 수 있게 한다 |

## 6. 진행 단계 (각 단계 승인 후, 단계마다 테스트 + 독립 커밋)

| 단계 | 작업 | DB 변경 |
|---|---|---|
| 1 | `alembic` 의존성 추가, `models/__init__.py`에 `approval_step` 등록 | 없음 |
| 2 | `alembic init`, `env.py` 설정, 기준점 리비전 생성 | 없음 |
| 3 | 테스트 DB를 리비전으로 생성하도록 변경 + 일치 검사 테스트 | 테스트 DB만 |
| 4 | 개발 DB와 기준점 비교(읽기 전용) → 차이 보고 | 없음 |
| 5 | **개발 DB 백업 후 `alembic stamp`** | 개발 DB에 `alembic_version` 표 1개 추가 **[승인]** |
| 6 | 서버 시작 절차 변경(`create_all`·자동 스크립트 제거, 리비전 확인 추가), start.bat 에 `alembic upgrade head` 추가 | 없음 **[승인]** |
| 7 | 기존 스크립트 54개를 `legacy_migrations/`로 이동, 문서화 | 없음 |

예상 규모: 반나절~하루. 단계 1~4는 DB를 바꾸지 않으므로 먼저 진행하고, 5·6은 결과를 보고 다시 승인받는 방식을 제안한다.

## 7. 승인 요청

1. 이 방식(기준점 + stamp, 시작 시 자동 구조 변경 중단)으로 진행해도 되는지
2. 단계 1~4를 먼저 진행하고, 개발 DB에 표시를 남기는 5단계와 시작 절차를 바꾸는 6단계는 결과를 본 뒤 따로 승인받는 방식이 좋은지

## 8. 1~4단계 결과 (2026-10-16)

| 단계 | 결과 |
|---|---|
| 1 | `alembic==1.20.0`(+`Mako`)을 `requirements.txt`에 추가. `models/__init__.py`에 `ApprovalStep` 등록(테이블 27개 모두 등록됨) |
| 2 | `backend/alembic/`, `alembic.ini` 생성. DB 주소는 `.env`에서 읽음(파일에 비밀번호 없음). 기준점 `0001_baseline`(테이블 27, enum 22) 생성 |
| 2 | 자동 생성된 순서가 `payments ↔ transactions` 순환 참조 때문에 틀려 실행이 실패했다 → 테이블을 외래키 의존 순서로 정렬하고 순환 외래키 1개를 마지막에 추가하도록 고쳤다. 모델에도 같은 외래키에 `use_alter=True`(DB 구조 변화 없음)를 지정해 순환 경고를 없앴다 |
| 2 | 빈 임시 DB 에서 `upgrade → downgrade → upgrade` 왕복과 `alembic check`(차이 없음) 확인 후 임시 DB 삭제 |
| 3 | 테스트 DB 를 `create_all` 대신 **리비전으로 생성**하도록 변경. 일치 검사 테스트 2건 추가(모델 ↔ 최신 리비전 차이 없음, 테스트 DB 가 최신 리비전). 전체 184 passed |
| 4 | 개발 DB(`erp_db`)와 기준점 비교(읽기 전용): **차이 20건, 모두 무해한 종류** |

### 개발 DB 와 기준점의 차이 (4단계)

| 종류 | 건수 | 내용 | 원인 |
|---|---|---|---|
| 서버 기본값 | 19 | `clients.receivable_amount`, `project_documents.status` 등 19개 컬럼에 DB 기본값(`DEFAULT 0`, `'draft'` 등)이 있는데 모델에는 없다 | 예전 1회성 스크립트가 컬럼을 추가하며 `DEFAULT` 를 붙였다. 앱은 값을 항상 직접 넣으므로 동작 영향 없음 |
| NULL 허용 | 1 | `document_issues.status` 가 DB 에서는 NULL 허용, 모델은 NOT NULL. **현재 NULL 인 행 0건** | 스크립트가 NOT NULL 을 빠뜨림 |
| 인덱스 | 1 | `schedule_events.recurrence_group_id` 인덱스가 DB 에 없음 | 스크립트가 인덱스를 만들지 않음 |

### 5·6단계 수정 제안

기준점과 개발 DB 를 같게 맞추는 **정리 리비전 `0002_align_legacy_db`** 를 추가한 뒤 stamp 한다.

1. 개발 DB 를 `pg_dump` 로 백업
2. `alembic stamp 0001_baseline` (개발 DB 에 `alembic_version` 표 1개 추가)
3. `alembic upgrade head` → `0002` 실행: 위 19개 기본값 제거, `document_issues.status` NOT NULL 지정, 빠진 인덱스 생성. 모든 문장을 `IF EXISTS / IF NOT EXISTS` 형태로 써서 **새 DB(기준점에서 만든 DB)에서는 아무 일도 하지 않는다**
4. 다시 비교해 차이 0건 확인
5. 서버 시작 절차 변경(6단계): `create_all`·자동 스크립트 3개 실행을 없애고, 리비전이 최신인지 확인만 한다. `start.bat` 에 `alembic upgrade head` 추가

데이터는 바뀌지 않는다(구조 메타데이터만 바뀌고, NOT NULL 대상 컬럼에 NULL 행이 없음을 확인함).

## 9. 5~7단계 결과 (2026-10-16, 사용자 승인)

| 단계 | 결과 |
|---|---|
| 5-1 백업 | `pg_dump`로 개발 DB 전체 백업: `backend/storage/backups/erp_db_20261016_145349_before_alembic.dump`(121KB, 테이블 데이터 27개 확인). storage 폴더라 git 에는 포함되지 않음 |
| 5-2 정리 리비전 | `0002_align_legacy_db.py`: 예전 스크립트가 붙인 DB 기본값 **19개** 제거, `document_issues.status` NOT NULL(NULL 행이 있으면 바꾸지 않고 멈춤), 빠진 인덱스 생성. 이미 같은 상태면 아무 일도 하지 않아 새 DB 에서는 변화 없음 |
| 5-3 개발 DB | `alembic stamp 0001_baseline` → `alembic upgrade head` → 현재 `0002_align_legacy_db (head)`, `alembic check` 차이 **0건**. 주요 테이블 행 수 그대로(거래처 18, 매입매출 36, 입출금 23, 사용자 8, 문서 37, 결재 단계 44) |
| 6 서버 시작 | `main.py`에서 `create_all`과 자동 스크립트 3개 실행 제거. 신규 `core/db_revision.py`가 리비전이 최신인지 확인(운영: 시작 거부, 개발: 경고). DB 연결 실패와 정기 이체 기록 실패의 오류 처리를 분리 |
| 6 start.bat | 서버를 띄우기 전에 `alembic upgrade head` 실행, 실패하면 서버를 띄우지 않고 멈춤 |
| 7 기존 스크립트 | 마이그레이션 스크립트 50개를 `scripts/legacy_migrations/`로 이동(`__init__.py` 없음 → import 불가), README 작성. 관리용 스크립트 4개(`create_admin`, `create_site_admin`, `process_stamp`, `reconcile_client_balances`)는 그대로 |

되돌리는 방법: 문제가 생기면 위 백업으로 `pg_restore --clean -d erp_db <백업파일>` 하고 이 변경 커밋을 되돌린다.
