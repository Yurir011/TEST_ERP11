# 01. 전체 코드 분석 결과

> 작성일: 2026-10-16 · 범위: 1단계(전체 분석). **소스코드는 수정하지 않았다.**
> 분석 방법: 디렉터리 구조 탐색, 파일·함수 길이 측정, `tsc`/`oxlint` 실행, 파이썬 AST로 미사용 import 검사, 핵심 모듈(인증·결재·금액) 직접 열람.
> 직접 확인하지 못한 항목은 "미확인"으로 표시했다.

---

## 1. 한눈에 보기

| 항목 | 현황 |
|---|---|
| 백엔드 | FastAPI + SQLAlchemy 2 + PostgreSQL, 파이썬 코드 약 14,400줄 |
| 프론트엔드 | React 19 + TypeScript 6 + Vite 8 + Tailwind 4, 약 19,200줄 |
| 자동 테스트 | **0개** (백엔드·프론트엔드 모두 없음. pytest, vitest 미설치) |
| 타입 검사 | `tsc -b` 통과 (오류 0) |
| 린트 | `oxlint` 오류 0 / 경고 16 (후크 의존성 4, 이펙트 내 setState 9, 컴포넌트 내보내기 3) |
| 파이썬 린트 | ruff/pyflakes 미설치. AST 검사로 미사용 import 3건 확인 |
| DB 스키마 관리 | `create_all` + 수동 마이그레이션 스크립트 54개 (Alembic 없음) |
| NFC 관련 코드 | **없음** (향후 확장 대상) |
| 감사 로그 | **없음** (결재 단계 기록만 존재) |

전체 평가: 기능은 폭넓게 구현되어 있고 타입 검사도 깨끗하다. 가장 큰 위험은 **테스트가 전혀 없다는 점**이다. 금액·결재·권한 로직이 여러 곳에 중복되어 있어, 테스트 없이 구조를 바꾸면 업무 결과가 달라져도 알아채기 어렵다. 그래서 계획의 첫 단계를 "안전망(테스트) 만들기"로 잡았다.

---

## 2. 구조

### 2.1 백엔드 (`backend/app`)

| 디렉터리 | 파일 수 | 역할 |
|---|---|---|
| `routers/` | 19 | API 엔드포인트. 일부는 비즈니스 로직까지 포함 |
| `services/` | 26 | PDF·엑셀 생성, 홈택스·팝빌·OCR 연동, 정기이체, 외상 잔액 |
| `models/` | 20 | SQLAlchemy 모델 |
| `schemas/` | 19 | Pydantic 입출력 모델 |
| `core/` | 5 | 인증(`security`, `deps`), 결재선(`approval`), 연차 계산(`leave_calc`) |
| `scripts/` | 54 | 1회성 마이그레이션·관리자 생성 (서버 시작 시 일부 자동 실행) |

주요 의존성: FastAPI, SQLAlchemy, psycopg2, PyJWT, passlib+bcrypt, reportlab, openpyxl, pillow, pytesseract, popbill, holidays, pywin32(엑셀→PDF 변환 1곳에서만 사용, Windows 전용).
`requirements.txt`는 전이 의존성까지 모두 고정한 freeze 형태라 직접 의존성과 구분되지 않는다.

### 2.2 프론트엔드 (`frontend/src`)

- `features/` 기능별 17개 폴더(attendance, leaves, payments, transactions, projectDocuments, proposals, clients, schedule, mobile 등), `components/`(approval, layout, ui), `lib/`(api, auth, format, logger, useOpenTarget, enterAsTab), `context/`(AuthContext).
- 상태 관리는 React 상태 + Context(인증)뿐이며 외부 상태 라이브러리는 없다. 데이터 조회는 각 페이지가 `apiGet`을 직접 호출한다.
- 의존성은 최소한이다(react, react-router, tailwind, lucide, lunar-javascript, 폰트).

---

## 3. 크기·복잡도 지표

### 3.1 가장 큰 파일

| 파일 | 줄 수 | 비고 |
|---|---|---|
| `backend/routers/project_documents.py` | 1,155 | 라우터에 결재·삭제·팝빌·PDF·이미지 처리가 모두 있음, `db.commit()` 25회 |
| `backend/routers/proposals.py` | 647 | 결재·삭제 요청·첨부 처리, `db.commit()` 21회 |
| `backend/routers/payments.py` | 599 | 목록·카드 결제예정·정산·부분 결제 로직 포함 |
| `backend/services/project_document_template.py` | 535 | 엑셀 템플릿 채우기 |
| `frontend/projectDocuments/ProjectDocumentsPage.tsx` | 1,262 | 목록·필터·결재·발행·모달 상태가 한 파일 |
| `frontend/payments/PaymentsPage.tsx` | 약 890 | 요약 카드·표·모달 8종·정산 계산 |
| `frontend/projects/ProjectDetailPage.tsx` | 805 | |
| `frontend/projectDocuments/ProjectDocumentFormPage.tsx` | 779 | |
| `frontend/clients/ClientFormPage.tsx` | 709 | |

### 3.2 긴 함수

백엔드 함수 432개 중 60줄을 넘는 것이 17개. 상위는 PDF 생성 함수 4개(130~145줄), `_fill_tax_invoice_template`(120줄), 홈택스 `build_plan`/`apply_plan`(약 100줄), `create_leave`(85줄)이다. PDF 생성 함수는 레이아웃 코드라 길이 자체는 위험이 낮다.

---

## 4. 주요 발견 사항

심각도: **높음**(업무 결과·보안에 영향 가능) / **중간**(유지보수 비용) / **낮음**(정리 수준)

### 4.1 금액·계산

| # | 발견 | 근거 | 심각도 |
|---|---|---|---|
| A1 | **부가세(10%) 계산이 5곳에 중복**되어 있고 모두 파이썬 `round()`를 쓴다. `round()`는 0.5를 짝수로 반올림(은행가 반올림)해서 `round(2.5)=2`가 된다. 한국 세무 관행(사사오입)과 다를 수 있고, 중복되어 있어 한 곳만 바뀌면 문서 금액과 장부 금액이 어긋난다. | `project_documents.py:165`, `sales_documents.py:134`, `transactions.py:244`, `project_document_excel.py:85`, `project_document_pdf.py:108` | 높음 |
| A2 | 외상 잔액(`services/transaction_credit.py`)과 부분 결제 로직이 **읽고-바꾸고-쓰는 방식**이라 동시에 두 요청이 오면 잔액이 어긋날 수 있다(행 잠금 없음). 5인 규모에서 확률은 낮지만 결재 버튼 더블클릭 같은 경우는 가능하다. | `transaction_credit.py`, `payments.py` | 중간 |
| A3 | 견적 단가가 `float`(`Numeric(18,2, asdecimal=False)`)이고 수량 곱셈도 float이다. 금액 반올림 오차 가능성이 있다. | `models/project_document.py:19,174` | 중간 |
| A4 | 최근 추가한 부분 수금/지급(`paid_amount`)과 잔액 계산에 **자동 테스트가 없다**. | — | 높음 |

### 4.2 날짜·시간

| # | 발견 | 근거 | 심각도 |
|---|---|---|---|
| B1 | 프론트엔드 `todayISO()`가 6개 파일에 함수로, 1곳(`ProjectsPage`)에 인라인으로 총 7곳에 복사되어 있고 `new Date().toISOString().slice(0,10)`을 쓴다. 이 값은 **UTC 기준**이라 한국 시간 00:00~09:00에는 **전날 날짜**가 된다. 입출금·매입매출 등록 기본 날짜가 하루 어긋날 수 있다. | `TransactionFormPage`, `PaymentFormPage`, `SettleModal`, `TransactionSettleModal`, `ProjectDocumentFormPage`, `UserFormPage`, `ProjectsPage` | 높음 |
| B2 | 백엔드 `attendance.py`는 `date.today()`(서버 지역 시간)로 날짜를 정하고 출퇴근 시각은 UTC로 저장한다. 서버 시간대가 KST가 아니면 날짜가 어긋난다. KST 상수는 이 파일에만 있고 공통 모듈이 없다. | `attendance.py:19,35,96,104` | 중간 |

### 4.3 보안·설정

| # | 발견 | 근거 | 심각도 |
|---|---|---|---|
| C1 | JWT 비밀키 기본값이 `"dev-only-change-me"`이고 **운영 환경에서 기본값을 쓰면 막는 장치가 없다**. `.env`를 빠뜨리면 누구나 토큰을 만들 수 있다. | `config.py:12` | 높음 |
| C2 | `LOG_LEVEL` 기본값이 `DEBUG`이다. 로그인 이메일, 요청 처리 상세가 로그에 남는다(CLAUDE.md 규칙상 운영에서는 환경변수로 낮추도록 되어 있으나 기본값이 DEBUG). | `config.py:6`, `routers/auth.py` | 중간 |
| C3 | 로그인 시도 횟수 제한(잠금/지연)이 없다. | `routers/auth.py` | 중간 |
| C4 | CORS가 `allow_methods=["*"]`, `allow_headers=["*"]`, `allow_credentials=True`이고 허용 출처에 특정 IP(`192.168.0.10`)가 코드에 박혀 있다. | `config.py:8`, `main.py:41-44` | 낮음 |
| C5 | 업로드 검증이 `Content-Type` 헤더만 확인한다(파일 내용 검사 없음). | `routers/clients.py:99,196`, `payments.py` | 중간 |
| C6 | 토큰을 `localStorage`에 보관한다(XSS 시 탈취 가능). 사내망 전용 앱이라 위험은 낮다. 만료 12시간, 갱신 토큰 없음. | `frontend/lib/auth.ts` | 낮음 |
| C7 | 감사 로그(누가 언제 무엇을 바꿨는지)가 없다. 금액 수정·삭제·권한 변경 이력을 추적할 수 없다. | — | 중간 |

### 4.4 데이터베이스

| # | 발견 | 근거 | 심각도 |
|---|---|---|---|
| D1 | 스키마를 `create_all` + 수동 스크립트 54개로 관리한다. 어떤 스크립트가 어느 DB에 적용됐는지 기록이 없고, 서버 시작 시 자동 실행되는 것은 일부뿐이다. 새 환경(운영 서버) 구축 시 순서 실수 위험이 있다. | `main.py:73-77`, `scripts/` | 높음 |
| D2 | 인덱스는 모델에 35개 지정되어 있다. 쿼리 계획(EXPLAIN)으로 확인한 적은 없다(**미확인**). | `models/` | 낮음 |
| D3 | 대부분의 목록 API가 페이지 나누기 없이 `.all()`을 반환한다. 현재 데이터 규모에서는 문제없으나 1년 이상 쌓이면 응답이 커진다. 측정 전이라 우선순위는 낮다. | `transactions.py`, `payments.py` 등 | 낮음 |
| D4 | 연관 데이터 로딩은 `joinedload`/`selectinload`를 약 60회 사용해 N+1이 대체로 방지되어 있다. | `routers/` | (양호) |

### 4.5 구조·중복

| # | 발견 | 근거 | 심각도 |
|---|---|---|---|
| E1 | **결재 승인/반려 흐름이 4개 라우터에 각각 구현**되어 있다(증명서, 연차, 프로젝트 문서, 품의서). 공통 모듈 `core/approval.py`가 있으나 단계 진행·알림·상태 변경 로직은 라우터마다 따로 있다. | `documents.py:187`, `leaves.py:319`, `project_documents.py:879,912`, `proposals.py:273` | 높음 |
| E2 | 라우터가 비즈니스 로직과 DB 접근을 함께 가진다. Service/Repository 계층이 없어 단위 테스트가 어렵다. | `project_documents.py`, `proposals.py`, `payments.py` | 중간 |
| E3 | 프론트엔드 승인/반려 핸들러(`handleApprove`/`handleReject`)가 4개 페이지에 비슷하게 중복되어 있다. | `LeavesPage`, `DocumentsPage`, `ProposalsPage`, `ProjectDocumentsPage` | 중간 |
| E4 | 프론트엔드 날짜·월 변환 함수 중복(`toMonthValue` 3곳, `todayISO` 7곳). `lib/format.ts`에 모이지 않았다. | 아래 표 참조 | 낮음 |
| E5 | `window.alert/confirm/prompt`를 45곳에서 직접 사용한다. 화면 일관성과 테스트가 어렵다(바꾸면 사용자에게 보이는 동작이 달라지므로 승인 필요). | `frontend/src` | 낮음 |
| E6 | 거대 페이지 컴포넌트(위 3.1). 목록·필터·모달·API 호출이 한 파일에 섞여 있다. | — | 중간 |
| E7 | `api.ts`를 거치지 않는 `fetch` 직접 호출 1곳. 401 응답(만료) 시 자동 로그아웃 처리는 확인된 범위에서 보이지 않는다(**미확인**). | `TaxInvoiceImages.tsx:16`, `lib/api.ts` | 낮음 |
| E8 | 린트 경고 16개: 이펙트 안에서 setState 호출 9곳, 후크 의존성 누락 4곳(대부분 `eslint-disable`로 억제, 전체 23곳), 컴포넌트 파일에서 함수 내보내기 3곳. | `oxlint` 결과 | 낮음 |

### 4.6 미사용 코드·정리 대상

- 미사용 import(AST 검사): `models/project_document.py`의 `BigInteger`, `services/recurring_payment.py`의 `Client`. (`main.py`의 `models`는 테이블 등록용이라 의도된 것이므로 삭제 금지.)
- 마이그레이션 스크립트 54개는 **삭제하지 않는다**(이력 보존). 일부는 서버 시작 시 호출된다.
- 프론트엔드 `console.debug/log` 직접 호출 4곳(나머지는 `lib/logger`). 프로젝트 규칙상 디버그 메시지는 유지 대상이다.
- 루트의 `PopBill/`(48MB), `PopBill.zip`, `archieve/`(155MB), `Doc/`는 `.gitignore`로 제외되어 있어 저장소에는 영향이 없다.
- `README.md`의 기능 목록이 실제와 다르다(결재 시스템, 품의서, 세금계산서·팝빌, 부분 결제, 일정·할일 등이 빠져 있음).

### 4.7 예외 처리·로그·오류 응답

- 전역 예외 처리기가 없다. 오류는 모두 `HTTPException(detail=문자열)`로 일관되게 내려가며, 프론트가 `detail`을 읽는다. 형식 자체는 일관적이다.
- `except Exception`이 5곳(`noqa: BLE001`)이다. 외부 파일 파싱·OCR 용도로 의도된 경우가 대부분이다.
- 로그는 `[모듈] 내용` 형식으로 통일되어 있다(프로젝트 규칙 준수). 요청 단위 추적 ID는 없다.

### 4.8 외부 연동

- 팝빌(전자세금계산서), 홈택스 엑셀 가져오기, Tesseract OCR(로컬), 엑셀→PDF(pywin32, Windows 전용).
- 팝빌 호출의 타임아웃·재시도 정책은 라이브러리 기본값에 의존하는 것으로 보이며 코드에서 설정한 곳은 확인되지 않았다(**미확인**, `popbill_service.py` 상세 검토 필요).

### 4.9 ERP 특화 영역 점검

| 영역 | 현황 |
|---|---|
| 계정·RBAC | `admin` / `site_admin` / `employee` 역할 + 직원별 메뉴 권한(`menu_permissions`) + 부서장 이상 직책 검사(`core/deps.py`). 의존성 주입으로 일관되게 적용됨. 권한 판정 테스트는 없음 |
| 근태 | 출근/퇴근 버튼, 월별 조회. 시간대 처리 정리 필요(B2) |
| 회계 | 부가세 중복(A1), 외상 잔액·부분 결제(A2, A4), 환율/외화 미지원(원화 전제) |
| 결재 | 4개 도메인에 중복 구현(E1) |
| 감사 로그 | 없음(C7) |
| NFC | 코드 없음. 인증 방식 확장을 위한 경계 설계가 필요하며 이번 리팩토링 범위에서는 "인증 제공자 인터페이스" 정의까지만 검토 |

---

## 5. 성능

측정 데이터가 없어 **병목을 확정하지 않았다**. 현재 확인된 것은 다음과 같다.
- 목록 API 페이지 나누기 없음(D3), 프론트엔드가 필터를 클라이언트에서 처리하는 화면이 있음(입출금 카드 탭 등).
- 화면별 중복 API 호출 여부는 확인하지 못했다(**미확인**).
- 성능 개선은 "느린 화면/쿼리를 측정 → 개선" 순서로만 진행한다.

---

## 6. 테스트·빌드·배포 환경

- 테스트: 없음. 수동 절차서 `docs/테스트_절차서.md`(237줄)만 존재.
- 빌드: `npm run build` = `tsc -b && vite build`. 백엔드는 빌드 단계 없이 uvicorn 실행.
- 배포: `start.bat`/`stop.bat`(로컬 실행). Docker Compose, 정기 DB 백업 스크립트는 아직 없다(CLAUDE.md 19단계 미완료).
- CI: 없음.
- 개발 DB가 로컬 PostgreSQL 하나뿐이다. **테스트가 이 DB를 건드리지 않도록 별도 테스트 DB가 필요**하다.

---

## 7. 중복 코드 목록 (프론트엔드)

| 함수 | 중복 위치 |
|---|---|
| `todayISO` | `PaymentFormPage`, `SettleModal`, `ProjectDocumentFormPage`, `UserFormPage`, `TransactionFormPage`, `TransactionSettleModal`, (`ProjectsPage` 지역 변수) |
| `toMonthValue` | `AttendanceSection`, `LeavesPage`, `PaymentsPage` 등 |
| 승인/반려 핸들러 | `LeavesPage`, `DocumentsPage`, `ProposalsPage`, `ProjectDocumentsPage` |

---

## 8. 결론: 변경 시 특히 조심할 곳

1. 금액 계산 전체(부가세, 외상 잔액, 부분 결제, 견적 합계)
2. 결재 단계 진행과 알림 연동(4개 도메인)
3. 권한 판정(`core/deps.py`와 `menu_permissions`)
4. 날짜 기준(KST) — 사용자에게 보이는 기본값이 달라질 수 있어 승인 필요
5. DB 마이그레이션 — 사전 승인 전에는 실행하지 않음
