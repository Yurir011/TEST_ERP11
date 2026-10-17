# BENCH ERP

주식회사 벤치소프트(BENCH) 사내 전용 ERP 시스템. 통신기기 개발·제조업체 특성에 맞춰 인사·영업·회계 업무를 하나의 인트라넷 웹앱에서 처리한다.

> 현재 버전 **V.0.70.160** ([변경 이력](./CHANGELOG.md)). 서비스는 사내 전용(외부 접근 차단 전제)이며, 이 저장소의 소스는 공개 상태다. 비밀번호·키 등 민감한 값은 `.env`(git 미포함)에만 두고 `.env.example`에는 예시 값만 둔다. 상세 기획/진행 상황은 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | React 19 + TypeScript + Vite + Tailwind CSS |
| 백엔드 | Python (FastAPI) + SQLAlchemy |
| DB | PostgreSQL |
| 인증 | JWT (Bearer Token), NFC 카드 로그인(Ed25519 서명 확인, `cryptography`) |
| 실시간 | WebSocket (메신저 알림) |
| 데스크톱 앱 | Electron + electron-builder (Windows 설치 파일), serialport (PN532 NFC 리더) |
| PDF 생성 | reportlab (한글 폰트: 맑은 고딕) |
| 음력/공휴일 | lunar-javascript |

## 주요 기능

사이드바 메뉴 기준이며, 메뉴별 접근 권한은 직원별로 관리자가 부여한다(`직원등록` 화면).

- **인증/권한**: 로그인(JWT), 대표(admin)·일반직원·사이트 관리자 역할, 직원별 메뉴 권한, 직책(부서장/팀장/대표) 기반 결재선
- **대시보드**: 근태·연차·프로젝트 현황 요약, 내 업무 알림(알림을 누르면 화면 이동 없이 상세 모달에서 바로 결재)
- **일정관리**: 월/주/일 캘린더, 반복 일정, 공휴일·음력 표시, 사이드바 메모(할 일)
- **전자결재**: 연차·증명서·품의서·견적서·거래명세서·세금계산서·발주서의 다단계 결재(부서장→팀장→대표), 전결, 반려 사유
- **연차관리**: 신청/승인/반려, 입사일 기준 자동 계산, 팀 연차 캘린더
- **재직/경력증명서**: PDF 자동 발급과 재다운로드
- **프로젝트관리**: 프로젝트 상태·진행상황(단계별 진행율·간트), 견적서·거래명세서 세트 작성(PDF·엑셀 출력), 발주서
- **거래처관리**: 등록/검색, 사업자등록증 이미지 인식(OCR), 미수금·미지급금
- **세금계산서**: 작성·결재, 팝빌 전자세금계산서 발행, 받은 세금계산서 이미지 인식(OCR)
- **매입매출관리**: 매입/매출 장부, 부가세 자동 집계(사사오입), 외상(미결제)과 부분 수금·지급 내역, 홈택스 엑셀 가져오기
- **입출금관리**: 입금/출금/카드 구분, 미수금·미지급금 처리(일부 수금·지급), 법인카드 결제예정과 카드 종류별 보기, 영수증 첨부, 카드 명세서 CSV 가져오기, 정기 자동이체
- **업무 알림(공지)**: 관리자 작성 공지와 결재 알림
- **출퇴근기록**: 출근/퇴근 버튼, 월별 조회(최근 36개월), 관리자 전체 현황
- **메신저**: 대화목록·즐겨찾기·전체목록 탭, 직원별 현재 상태(출근·외근·출장·휴가 등, 출근 토글과 연동), 1:1·그룹 대화, 파일 첨부(20MB), 메시지별 안 읽은 사람 수 표시(카카오톡 방식), 실시간 알림. 대화방 참여자만 볼 수 있고 대표(관리자)도 남의 대화는 볼 수 없다. 변경 이력에는 대화 내용이 남지 않는다
- **데스크톱 앱(`/desktop`, Electron)**: 서버 화면을 그대로 불러오고, NFC 카드 로그인(승인된 PC만), 메신저 알림·트레이·윈도우 시작 시 자동 실행(선택)을 더한다. Windows 설치 파일은 `cd desktop && npm run dist` → `desktop/release/BENCH-ERP_Setup_0.70.160.exe`(기본 서버 주소 포함), 직원에게는 `npm run publish-release`로 새 버전을 알린다. macOS·Linux는 보류. 사용법은 [`docs/client-app/사용설명서.md`](./docs/client-app/사용설명서.md), 진행 상황은 [`docs/client-app/`](./docs/client-app/)
- **모바일 화면(`/m`)**: 출퇴근, 연차, 결재, 일정, 공지, 거래처 조회

## 시작하기

### 방법 1 — 배치 파일 (권장)
루트의 `start.bat`을 더블클릭하면 백엔드/프론트엔드가 각각 새 창으로 실행되고 브라우저가 자동으로 열린다. 종료는 `stop.bat` 또는 두 콘솔 창을 직접 닫으면 된다.

### 방법 2 — 수동 실행 (최초 1회는 의존성 설치 필요)
```bash
# 백엔드 (최초 1회: 가상환경 생성 + 패키지 설치)
cd backend
python -m venv venv
./venv/Scripts/python.exe -m pip install -r requirements.txt
./venv/Scripts/python.exe -m alembic upgrade head   # DB 구조를 최신으로 (처음 한 번, 그리고 코드 업데이트 후마다)
./venv/Scripts/python.exe -m uvicorn app.main:app --port 8000

# 프론트엔드
cd frontend
npm install
npm run dev
```

`backend/.env`가 없다면 `backend/.env.example`을 복사해서 값을 채운다 (DB 접속정보, JWT 시크릿, 회사정보 등).

**운영 서버 설정**: `.env`에 `ENVIRONMENT=production`과 32자 이상의 임의 `JWT_SECRET_KEY`를 지정한다. 비밀키가 기본값이거나 짧으면 운영 모드에서는 서버가 시작되지 않는다. 로그량은 `LOG_LEVEL`(기본 INFO)로 조정하고, 개발 PC에서는 `LOG_LEVEL=DEBUG`로 둔다.

### 같은 사무실 네트워크의 다른 PC에서 테스트하기
`start.bat`으로 서버를 켠 PC와 같은 공유기(네트워크)에 연결돼 있다면, 별도 서버 없이 그 PC의 IP로 접속해서 테스트할 수 있다.

- 서버 PC의 IP 확인: PowerShell에서 `ipconfig` → "IPv4 주소" 확인
- 다른 PC 브라우저에서 `http://<서버 PC의 IP>:5173` 접속 (예: `http://192.168.0.10:5173`)
- 화면은 Vite 프록시를 거쳐 같은 주소로 API를 부르므로 서버 PC의 IP가 바뀌어도 CORS 설정은 바꿀 필요가 없다. 다른 주소에서 API(8000 포트)를 직접 부를 때만 `backend/.env`의 `CORS_ORIGINS`에 주소를 추가한다
- Windows 방화벽에서 5173, 8000 포트 인바운드 허용이 필요하다 (사설 네트워크 기준)

- 프론트엔드: http://localhost:5173
- 백엔드 헬스체크: http://localhost:8000/api/health
- DB 접속 정보는 `backend/.env.example` 참고 (실제 값은 `backend/.env`에 별도 관리, git 미포함)

### 최초 관리자 계정 생성
```bash
cd backend
./venv/Scripts/python.exe -m app.scripts.create_admin
```

## 프로젝트 구조

```
/backend
  app/
    models/         SQLAlchemy 모델
    schemas/        Pydantic 스키마
    routers/        API 라우터
    services/       PDF·엑셀 생성, 팝빌·홈택스·OCR 연동, 금액 계산(money.py), 외상 잔액
    core/           인증, 보안, 의존성, 결재선, 연차 계산
    scripts/        1회성 마이그레이션·관리자 생성 (일부는 서버 시작 때 자동 실행)
  tests/            pytest 테스트 (별도 erp_test DB 사용)
/desktop            데스크톱 앱(Electron): NFC 리더, 카드 로그인, 트레이·알림, 설치 파일·배포 스크립트
/frontend
  src/
    features/       기능별 모듈 (attendance, leaves, payments, transactions, ...)
    components/     공통 레이아웃/UI/결재 컴포넌트
    lib/            API 클라이언트, 포맷터, 로거
/docs
  테스트_절차서.md     수동 점검 절차
  refactoring/       리팩토링 분석·계획·수정 내역·검증 결과
```

## 테스트

백엔드 자동 테스트는 **운영/개발 DB(`erp_db`)와 분리된 `erp_test` DB**에서만 실행된다(다른 DB 이름이면 시작되지 않는다). 각 테스트는 끝나면 롤백된다.

```bash
# 최초 1회: PostgreSQL에 빈 DB erp_test 생성 (소유자 erp_user), 개발 의존성 설치
cd backend
./venv/Scripts/python.exe -m pip install -r requirements-dev.txt

# 실행
./venv/Scripts/python.exe -m pytest
```

프론트엔드는 `npm test`(vitest), `npm run build`(타입 검사 포함), `npm run lint`로 점검하고, 데스크톱 앱은 `cd desktop && npm test`로 점검한다. 화면 동작은 [`docs/테스트_절차서.md`](./docs/테스트_절차서.md)로 수동 확인한다.

## 참고 문서

- [`CLAUDE.md`](./CLAUDE.md) — 20단계 구축 계획 및 진행 상황 체크리스트
- [`CHANGELOG.md`](./CHANGELOG.md) — 버전별 변경 이력 (현재 V.0.70.160)
- [`docs/version-policy.md`](./docs/version-policy.md) — 버전 표기·올리는 기준·배포 절차 (커밋 메시지는 `[V.0.70.150] type(scope): 설명` 형식)
- [`docs/client-app/`](./docs/client-app/) — 데스크톱 앱·NFC 로그인·메신저 단계별 문서, [사용 설명서](./docs/client-app/사용설명서.md)
- [`docs/refactoring/`](./docs/refactoring/) — 리팩토링 분석, 계획, 수정 내역, 검증 결과

## DB 구조 변경 (Alembic)

DB 구조(테이블·컬럼)는 Alembic 리비전(`backend/alembic/versions/`)으로 관리한다. **서버는 시작할 때 DB 구조를 바꾸지 않고**, 최신인지 확인만 한다(운영 환경에서 최신이 아니면 시작하지 않음). `start.bat`는 서버를 띄우기 전에 `alembic upgrade head`를 실행한다.

```bash
cd backend
./venv/Scripts/python.exe -m alembic current                                   # 현재 DB 리비전
./venv/Scripts/python.exe -m alembic upgrade head                              # 최신으로 올리기 (운영 DB 는 먼저 pg_dump 백업)
./venv/Scripts/python.exe -m alembic revision --autogenerate -m "설명"          # 모델을 바꾼 뒤 리비전 만들기 → 파일을 읽고 확인 후 함께 커밋
```

- 모델만 바꾸고 리비전을 만들지 않으면 테스트(`tests/test_alembic_schema.py`)가 실패한다.
- PostgreSQL enum 에 값을 추가한 것은 자동으로 잡히지 않는다. 리비전에 `ALTER TYPE ... ADD VALUE`를 직접 적는다.
- 예전 1회성 스크립트는 `backend/app/scripts/legacy_migrations/`에 이력으로만 남아 있고 실행하지 않는다.

## 백업과 복원

`backup.bat`(또는 `backend` 폴더에서 `venv\Scripts\python.exe -m app.scripts.backup_db --with-files`)를 실행하면 `backend/storage/backups/daily/`에 다음이 생긴다.

| 파일 | 내용 |
|---|---|
| `erp_db_YYYYMMDD_HHMMSS.dump` | DB 전체 (`pg_dump -Fc`). 만든 직후 파일을 열어 표 데이터가 들어 있는지 확인한다 |
| `storage_YYYYMMDD_HHMMSS.zip` | 영수증·PDF·첨부 파일 (`storage` 폴더, 백업 폴더 제외). `--with-files` 일 때만 |

- 30일(`--keep-days`로 변경) 지난 **이 형식의 파일만** 자동으로 지운다. 수동 백업(`*_before_*.dump` 등)은 건드리지 않는다.
- 다른 위치에 두려면 `--dir D:\erp_backup`. 백업은 같은 디스크가 아닌 곳(외장 디스크·NAS)에 한 부 더 두는 것을 권한다.
- 첨부 파일 zip 은 지금 약 40MB 라 30일이면 약 1.2GB 다. 공간이 부족하면 DB 는 매일, 첨부 파일은 매주(`--with-files` 를 주 1회 작업에만)로 나눈다.
- 실패하면 종료 코드 1 과 `[Backup] 백업 실패: ...` 로그를 남긴다(작업 스케줄러의 "마지막 실행 결과"에서 확인).

**매일 새벽 3시에 자동 실행 (Windows 작업 스케줄러, 관리자 명령 프롬프트에서 1회)**
```bat
schtasks /Create /TN "BENCH ERP 백업" /TR "\"C:\Repo\Python\GUI_STUDY\11\backup.bat\"" /SC DAILY /ST 03:00 /RU SYSTEM
```
경로는 실제 설치 위치로 바꾼다. Docker 로 옮기면 같은 스크립트를 백엔드 컨테이너 안에서 실행하거나(`PG_BIN` 환경변수로 `pg_dump` 위치 지정), DB 컨테이너에서 `pg_dump` 를 직접 실행한다.

**복원** (덮어쓰므로 먼저 지금 DB 를 한 번 더 백업할 것)
```bash
pg_restore --clean --if-exists --no-owner -h localhost -U erp_user -d erp_db backend/storage/backups/daily/erp_db_YYYYMMDD_HHMMSS.dump
# 첨부 파일: zip 을 backend/storage/ 에 풀기
```
