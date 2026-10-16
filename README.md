# BENCH ERP

주식회사 벤치소프트(BENCH) 사내 전용 ERP 시스템. 통신기기 개발·제조업체 특성에 맞춰 인사·영업·회계 업무를 하나의 인트라넷 웹앱에서 처리한다.

> 외부 비공개, 사내망 전용. 상세 기획/진행 상황은 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | React 19 + TypeScript + Vite + Tailwind CSS |
| 백엔드 | Python (FastAPI) + SQLAlchemy |
| DB | PostgreSQL |
| 인증 | JWT (Bearer Token) |
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

프론트엔드는 `npm run build`(타입 검사 포함)와 `npm run lint`로 점검한다. 화면 동작은 [`docs/테스트_절차서.md`](./docs/테스트_절차서.md)로 수동 확인한다.

## 참고 문서

- [`CLAUDE.md`](./CLAUDE.md) — 20단계 구축 계획 및 진행 상황 체크리스트
- [`docs/refactoring/`](./docs/refactoring/) — 리팩토링 분석, 계획, 수정 내역, 검증 결과
