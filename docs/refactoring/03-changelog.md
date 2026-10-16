# 03. 수정 내역

> 단계가 끝날 때마다 이 문서에 추가한다. 각 단계는 독립 커밋으로 구분한다.

## 전체 요약 (2026-10-16)

| 단계 | 내용 | 커밋 |
|---|---|---|
| P0 | 안전망: 백엔드 pytest 도입, 별도 `erp_test` DB, 특성화 테스트 74건 | `f345cbc` |
| P2 | 부가세 계산 13곳 → `services/money.py` 한 곳으로 통합 | `72edfb7` |
| P2 | 부가세·품목 금액 **사사오입** 적용(사용자 승인) | `b11499b` |
| P1 | 미사용 import, 린트 경고 16→10, README 갱신 | `2328425` |
| P2 | 오늘 날짜 **UTC 버그 수정**(한국 00~09시에 전날 표시), `lib/date.ts` | `5400157` |
| P3-1 | 결제·정산 로직 → `services/settlement.py` | `2d2ffaf` |
| P3-2 | 결재 단계 처리 공통화(`core/approval.py`), 결재 흐름 테스트 | `4ed2afa` |
| P4-1 | 결재 승인/반려 공통 훅 `useApprovalActions` (12개 핸들러 통합) | `5d362b1` |
| P4-2 | 입출금관리 페이지 분해(886→610줄) | `073780f` |
| P4-3 | 프론트엔드 테스트 러너 vitest 도입, 순수 함수 테스트 | `45ef539` |
| P4-4 | 문서관리 페이지 분해(1,223→857줄) | `dc7ef57` |
| P4-5 | 프로젝트 상세 페이지 분해(805→258줄) | `2380589` |
| P3-3 | `project_documents.py`(1,155줄) 안전망 테스트 + 서비스 분리 + 패키지 분할 | `f56168c`, `ba276ec`, `e1190b7` |
| P3-4 | 결재 코드 `approval.py` 분리(06 분할안 완료) | `3778b81` |
| P5(일부) | JWT 기본 비밀키 운영 차단, 로그 레벨 기본값 INFO, `.env`의 `LOG_LEVEL` 무시되던 버그 수정 | `2b18558` |
| P5(일부) | 로그인 시도 제한(5회 실패 시 5분 잠금) | `ca1a90e` |
| P5(일부) | 업로드 파일 내용 검사(매직 바이트) | `e6931f0` |
| P5(일부) | CORS 정리(허용 주소 설정화, 메서드·헤더 최소화) | `a978d7d` |
| 데이터 정리 | 거래처 잔액을 미결제 건 기준으로 정리하는 스크립트 + 개발 DB 적용(사용자 확인: 기존 데이터는 모두 테스트 입력) | `cfc4bd1` |
| 업무 규칙 | 잔액만 줄이는 정산에서 잔액보다 큰 금액 거절(잔액 어긋남 원인 차단) | `0ee29fd` |
| P6(일부) | Alembic 도입 1~4단계: 의존성, 기준점 리비전, 테스트 DB 를 리비전으로 생성, 개발 DB 비교(변경 없음) | `b0a7d37`, `47e473c` |
| P6 | Alembic 도입 5~7단계: 개발 DB 백업·stamp·정리 리비전, 서버 시작 시 자동 구조 변경 중단, 기존 스크립트 이동 | `a98fb6b` |
| P5 | 감사 로그 1~4단계: 모델·리비전 0003, 자동 기록, 로그인 기록, 대표 전용 조회 API | `ec74e9a` |
| P5 | 감사 로그 5단계: 개발 DB 백업 후 `audit_logs` 테이블 적용 | `c2550c4`(문서) |
| P5 | 거래처 잔액 변경 이력 화면(타임라인) + API, 거래처 메뉴 권한으로 조회 | `fbeb11e` |
| P5 | 설정 › 변경 이력 화면(대표 전용) + 조회 API 검색 보강 | `77cd2ab` |
| P3 | 품의서 결재 단계를 공용 테이블로 통합 1~4단계(안전망·리비전 0004/0005·코드 교체·개발 DB 적용) | `63fa0cb`, `1e3b8dd`, `1d1dd13` |
| S2 | `proposals.py` 분할(라우터 패키지 + PDF 생성 서비스) | `24fadd0`, `792d738` |
| S3 | `payments.py` 처리 코드를 서비스로(카드 결제예정·조회·수정 시 재정산) | `8330803`, `46ac221` |
| S3 | `transactions.py` 조회를 서비스로, 세금계산서 매출/매입 판단·금액 계산 중복 통합 | `f7a3e1c`, `124b84f` |
| S4 | 프론트엔드 폼 페이지 3개 분해 | `3d76f23`, `16df409`, `a809fa1` |
| 버그 | 문서 금액 미리보기를 서버와 같은 사사오입으로(`lib/money.ts`) | `fc8955f` |
| S5 | 프론트엔드 린트 경고 10 → 0 | `1f5238c` |
| S9 | `npm audit fix` | `45fd2e1` |
| S1 | 옛 품의서 결재 단계 테이블 삭제(리비전 0006, 개발 DB 적용) | `d0393d0` |
| R5 | 결제된 매입매출 삭제 후 잔액 되살아남 수정 | `495283d` |
| O7 | 팝빌 통신 타임아웃·504 안내, 팝빌 부가세 계산 중복 제거 | `110d7dc` |
| S8 | 브라우저 알림창 → 화면 안의 창·알림 (B안) | `9d08d9c` |
| S7 | 화면별 코드 분할 + 로그인 후 미리 받기 | `377ed71` |
| S10 | 화면(컴포넌트) 자동 테스트 도입 | `dcf3856` |
| O8 | 정기 백업 스크립트 | 이번 커밋 |

사용자에게 보이는 **동작이 바뀐 것**은 모두 승인을 받았다: ① 부가세·품목 금액 반올림(사사오입), ② 오늘 날짜 기본값(로컬 시간), ③ 로그인 실패 반복 시 일시 잠금, ④ 업로드 파일 내용 검사와 크기 제한, ⑤ 잔액보다 큰 잔액 정산 거절, ⑥ 거래처 상세의 "변경 이력" 버튼(새 화면), ⑦ 설정 › 변경 이력 화면(새 화면). 나머지는 구조 정리이며 API 경로·화면·DB 스키마는 바뀌지 않았다. DB 컬럼 추가(`paid_amount` 등)는 리팩토링 이전의 부분 결제 기능 작업에서 이뤄졌다.

---

## P0. 안전망(테스트 기반) 구축 — 2026-10-16

**목적**: 리팩토링 전에 금액·권한·결재·근태·연차 로직의 "현재 동작"을 테스트로 고정한다. **운영 코드는 수정하지 않았다.**

### 추가한 파일

| 파일 | 내용 |
|---|---|
| `backend/requirements-dev.txt` | 개발·테스트 전용 의존성(pytest 9.1.1, httpx 0.28.1). 운영 `requirements.txt`는 변경하지 않음 |
| `backend/pytest.ini` | pytest 설정(테스트 경로, 경고 필터) |
| `backend/tests/conftest.py` | 테스트 DB 안전장치, 롤백 세션, TestClient, 사용자·거래처 생성 픽스처 |
| `backend/tests/test_leave_calc.py` | 연차 계산 13건 |
| `backend/tests/test_money.py` | 품목 금액·부가세 반올림 14건 |
| `backend/tests/test_rbac.py` | 권한 판정·인증 인가 API 16건 |
| `backend/tests/test_credit_settlement.py` | 외상 잔액·전액/부분 결제·결제 삭제 복원 19건 |
| `backend/tests/test_approval_and_attendance.py` | 결재선 검증, 연차 결재·반려 흐름, 출퇴근 12건 |
| `.gitignore` | `.pytest_cache/` 제외 추가 |

### 테스트 환경 안전장치
- 테스트는 **별도 DB `erp_test`에서만** 실행된다. 접속 정보는 `backend/.env`의 `DATABASE_URL`에서 DB 이름만 바꿔 만들며(비밀번호를 코드에 쓰지 않음), DB 이름이 `erp_test`가 아니면 테스트가 시작되지 않는다(`assert`).
- 각 테스트는 바깥 트랜잭션 안에서 실행되고 끝나면 롤백된다. 실행 후 `erp_db`에 테스트 계정이 남지 않았음과 `erp_test`가 비어 있음을 직접 확인했다.
- TestClient를 `with` 없이 사용해 서버 시작 이벤트(마이그레이션, 정기이체 생성)가 실행되지 않는다.

### 환경 작업(승인된 항목)
- 로컬 PostgreSQL에 빈 DB `erp_test` 생성(소유자 `erp_user`). 스키마는 테스트 시작 시 `create_all`로 만든다.
- 백엔드 가상환경에 pytest, httpx 설치.

### 테스트로 고정한 현재 동작(주요)
- 부가세가 파이썬 `round()`(은행가 반올림)로 계산된다. 예: 공급가액 25 → 부가세 2, 45 → 4. **변경 여부는 별도 승인 사항**이다.
- 잔액만 줄이는 정산은 0 미만으로 내려가지 않는다(잔액보다 많이 지급하면 0으로 고정).
- 사이트 관리자(`site_admin`)는 메뉴 권한 대상 메뉴(거래·입출금 등)에 접근할 수 없다.
- 부분 결제한 입출금은 금액을 수정할 수 없고, 완납된 건의 분할 결제는 삭제할 수 없다.

### 이번 단계에서 하지 않은 것
- 프론트엔드 테스트 러너(vitest)는 도입하지 않았다. 프론트엔드 순수 함수가 정리되는 P2에서 필요 시 다시 제안한다.

## P2(일부). 부가세·품목 금액 계산 통합과 사사오입 적용 — 2026-10-16

두 개의 커밋으로 나눠 진행했다.

### 1) 계산 위치 통합 (동작 변경 없음) — 커밋 `72edfb7`
- 신규 `backend/app/services/money.py`: 부가세 계산 함수 `vat_amount()`를 한 곳에 둠.
- 7개 파일 13곳의 `round(x * 0.1)`을 `vat_amount(x)`로 교체(`routers/project_documents.py`, `routers/sales_documents.py`, `routers/transactions.py`, `services/project_document_excel.py`, `services/project_document_pdf.py`, `services/project_document_template.py`, `services/tax_invoice_list_excel.py`).
- 검증: 변경 전 테스트 74건이 그대로 통과(결과 동일).

### 2) 반올림 방식을 사사오입으로 변경 (사용자 승인) — 별도 커밋
- `money.py`에 `round_half_up()`, `line_amount()` 추가. 부동소수 오차를 피하려고 `Decimal`로 계산한다.
- `vat_amount()`와 품목 금액 `calc_amount()`(`models/project_document.py`)가 사사오입을 쓴다.
- 효과: 공급가액 25원 → 부가세 3원(이전 2원), 45원 → 5원(이전 4원). 품목 금액 3 × 454,545.5 → 1,363,637원(이전 1,363,636원).
- **화면과 PDF 불일치 해소**: 프론트엔드는 원래 `Math.round`(사사오입)로 부가세를 보여주고 있어서, 끝자리가 5인 공급가액에서는 화면 금액과 PDF·장부 금액이 1원 달랐다. 이제 같은 규칙이다.
- 테스트: `tests/test_money.py`를 사사오입 기준으로 갱신(14건 → 27건으로 보강).

### 영향 및 주의
- 이미 **저장된 장부(매입매출) 금액은 바뀌지 않는다.** 저장된 값은 그대로이고 새로 계산하는 문서부터 새 규칙이 적용된다.
- 이미 발행된 문서를 **PDF/엑셀로 다시 내려받으면** 합계가 계산식을 다시 실행하므로 끝자리가 5인 경우 1원 차이가 날 수 있다.
- 일부 코드(`sales_documents.py`)는 품목별 반올림 없이 합계를 곱하는 별도 방식을 쓰고 있어 그대로 두었다(이 파일의 계산 방식 통일은 별도 검토 항목).

## P1. 무해한 정리 — 2026-10-16

동작 변경 없는 정리만 수행했다.

| 구분 | 내용 | 파일 |
|---|---|---|
| 미사용 import 제거 | `BigInteger` 제거 | `backend/app/models/project_document.py` |
| 확인 후 유지 | `recurring_payment.py`의 `Client`는 관계 매핑용(`noqa: F401` 주석 있음)이라 **삭제하지 않음** | — |
| 린트(only-export-components) | 파일 밖에서 쓰지 않는 `formatNumberText`, `POPBILL_CLIENT_FIELDS`를 `export` 해제 | `NumberInput.tsx`, `PopbillRequiredInfoModal.tsx` |
| 린트(exhaustive-deps) | 객체(`period`) 대신 `period?.year/month` 값을 의존성으로 쓰도록 정리(조회 조건 동일) | `OutstandingDetailModal.tsx` |
| 린트(exhaustive-deps) | 의도된 "처음 한 번만 실행" 이펙트 3곳에 이유 주석과 `eslint-disable-next-line` 추가 | `ProjectDocumentsPage.tsx`, `ProjectDocumentFormPage.tsx` |
| 문서 | README를 실제 기능·구조·테스트 방법에 맞게 갱신 | `README.md` |

- 린트 경고 16개 → **10개**. 남은 것: `set-state-in-effect` 9개(P4에서 화면별 처리), `AuthContext`의 `only-export-components` 1개(훅과 Provider를 한 파일에 두는 일반적인 패턴이라 유지).
- 마이그레이션 스크립트는 삭제하지 않았다.

## P2(일부). 오늘 날짜 기본값을 로컬 시간 기준으로 수정 (버그 수정, 사용자 승인) — 2026-10-16

- 문제: `new Date().toISOString().slice(0, 10)`는 UTC 기준이라 **한국 시간 00:00~09:00에는 전날 날짜**가 나왔다(등록 화면 기본 날짜, 조회 기간 등).
- 수정: 신규 `frontend/src/lib/date.ts`에 `toLocalISODate()`, `todayISO()`, `toMonthValue()`를 두고 흩어져 있던 복사본을 모두 교체했다.
  - `todayISO` 로컬 정의 7곳 삭제(PaymentFormPage, SettleModal, ProjectDocumentFormPage, UserFormPage, TransactionFormPage, TransactionSettleModal, TransactionsPage)
  - `toMonthValue` 로컬 정의 4곳 삭제(AttendanceSection, LeavesPage, PaymentsPage, TransactionsPage)
  - 인라인 `toISOString().slice(0, 10)` 6곳 교체(ClientsPage, ProjectOverviewCard, ProjectsPage, ProjectStageBoard, ProjectDocumentsPage, TransactionsPage의 `monthsAgoISO`)
- 효과: 00:00~09:00에 등록 화면을 열어도 오늘 날짜가 기본으로 들어간다. 그 외 시간대의 동작은 같다.

## P3-1. 결제·정산 로직을 서비스로 분리 — 2026-10-16

- 신규 `backend/app/services/settlement.py`: "결제 하나가 거래처 잔액과 매입매출 상태에 만드는 변화"를 한곳에 모음.
  - `settlement_field`, `apply_balance_settlement`, `revert_balance_settlement`: 거래처 잔액만 줄이는 정산(기존 `payments.py`의 `_settlement_field` 등을 이동)
  - `is_partial_payment`, `apply_transaction_payment`: 매입매출 건 결제(전액·부분)
  - `undo_payment_effects`: 결제 삭제 시 되돌리기
  - 상수 `SETTLEMENT_RECEIVABLE_CATEGORY`, `SETTLEMENT_PAYABLE_CATEGORIES`도 이동
- `backend/app/routers/payments.py`: 위 로직을 서비스 호출로 교체(`create_payment`, `update_payment`, `delete_payment`). 파일 길이 599줄 → 약 540줄, 라우터는 HTTP 입출력과 조회에 집중.
- API 경로·요청/응답 형식·오류 메시지는 변경 없음.
- 테스트 추가: `tests/test_settlement_service.py` 15건(정산 대상 판정 표, 부분 결제 판정 경계값, 잔액 가감).

### 진행 중 확인된 사항
- 리팩토링 중 `remaining_amount` import 누락 실수가 있었고, **기존 통합 테스트가 즉시 잡아냈다**(`test_linkable_transactions_show_remaining_amount` 실패). 수정 후 전부 통과. 안전망이 의도대로 작동함을 확인했다.

## P3-2. 결재 단계 처리 공통화 — 2026-10-16

- 신규 헬퍼 `core/approval.py`의 `approve_current_step()`, `reject_current_step()`: "현재 단계를 승인/반려 처리하고(상태·결정 시각), 승인이면 다음 단계(마지막이면 None)를 돌려준다"는 반복 로직을 한곳에 모음.
- 적용(6곳): `routers/leaves.py`(승인·반려), `routers/documents.py`(승인·반려), `routers/project_documents.py`(`_approve_one`, `_reject_one`). 각 곳에서 3~4줄씩 반복되던 `next(...)` 검색과 상태·시각 기록을 제거.
- **유지한 것**: 최종 승인 시 도메인별 후처리(PDF 발급, 매입매출 자동 기록, 연차 일정 반영, 삭제 결재 처리), 알림 문구와 링크, 묶음 문서(견적서+거래명세서) 동시 처리는 각 라우터에 그대로 둠. 이들은 도메인마다 달라서 억지로 합치면 오히려 복잡해진다(과도한 추상화 방지).
- 테스트 추가: `tests/test_approval_flows.py` 10건(증명서 승인·반려·전결 금지·자기결재, 프로젝트 문서 승인·반려·재처리 방지, 헬퍼 단위).

### 범위에서 제외한 것
- **품의서(`proposals.py`)는 별도의 단계 테이블(`ProposalApprovalStep`)을 쓴다.** 다른 3개 도메인의 공용 `ApprovalStep`과 모델이 다르다. 하나로 합치려면 DB 스키마·데이터 이전이 필요하므로 **승인 없이 진행하지 않았다**(05-remaining-issues.md S1).

## P4-1. 결재 승인/반려 핸들러 공통 훅 — 2026-10-16

- 신규 `frontend/src/lib/useApprovalActions.ts`: 승인 확인창 → API 호출 → 처리 중 표시 → 승인 안내창 / 반려 사유 입력 → 실패 메시지의 공통 흐름을 한 훅으로 모음. 화면별 차이(확인 문구, 새로고침 방식, 오류 표시, 완료 후 콜백)는 옵션으로 받는다.
- 적용: `LeavesPage`, `DocumentsPage`, `ProposalsPage`, `ProjectDocumentsPage`(문서용 + 품의서용 2세트). 총 6쌍(12개) 핸들러, 약 130줄이 훅 호출로 줄었다.
- 확인창·안내창 문구, 처리 순서(새로고침 → 안내창 → 완료 콜백), 오류 표시 여부는 **기존 그대로** 유지했다. 달라진 점은 승인/반려 시도 로그가 모든 화면에서 남는 것뿐이다.
- 사용하지 않게 된 import(`apiPut`, `ApiError`)를 정리했다.

## P4-2. 입출금관리 페이지 분해 — 2026-10-16

`PaymentsPage.tsx`를 886줄 → **610줄**로 줄였다. **화면과 동작은 그대로**이고 코드를 파일로 옮기기만 했다.

| 신규 파일 | 내용 |
|---|---|
| `payments/outstanding.ts` | 미수금/미지급금 행 계산(`buildOutstandingRows`), 발생일·일부 수금일 라벨 — 화면 상태와 분리한 **순수 함수** |
| `payments/OutstandingCards.tsx` | 상단 요약 카드 3개(미수금·미지급금·카드 결제예정) |
| `payments/CardFilterBoxes.tsx` | 카드 탭의 카드 종류별 요약 상자 |
| `payments/PaymentsTable.tsx` | 입출금 내역 표(고정 칸 너비, 폰트 크기 맞춤, 행 동작) |

- 페이지에는 데이터 조회, 필터 상태, 모달 열기/닫기만 남았다.
- 컴포넌트는 필요한 값과 콜백만 props 로 받는다(전역 상태 없음).
- 순수 함수는 이후 프론트엔드 테스트 러너(vitest)를 도입하면 바로 테스트할 수 있다.

## P4-3. 프론트엔드 테스트 러너(vitest) 도입 — 2026-10-16 (사용자 승인)

- 개발 전용 의존성 `vitest`(5.0.5) 추가, `npm test` 스크립트, `vite.config.ts`에 node 환경 테스트 설정(`src/**/*.test.ts`). 화면 번들에는 포함되지 않는다.
- 순수 함수 테스트 16건:
  - `lib/date.test.ts`: 자정 직후에도 로컬 날짜 유지, 월·일 두 자리, `toMonthValue`
  - `lib/format.test.ts`: `formatCurrency`
  - `features/transactions/types.test.ts`: `remainingAmount`(부분 결제 남은 금액, 음수 방지)
  - `features/payments/outstanding.test.ts`: 미수금·미지급금 행 계산(전체/월별, 금액 0원 건, 잔액·건 불일치, **전체 ≥ 월별**), 최초 발생일, 최근 일부 수금일

## P4-4. 문서관리 페이지 분해 — 2026-10-16

`ProjectDocumentsPage.tsx`를 1,223줄 → **857줄**로 줄였다. **화면과 동작은 그대로**이고 JSX는 원문 그대로 옮겼다.

| 신규 파일 | 내용 |
|---|---|
| `projectDocuments/documentHelpers.ts` | 품목 합계·요약, 파일명, 세금계산서 통계 집계(`computeTaxInvoiceStats`), 세금계산서 조회 조건 적용(`filterTaxInvoices`), 목록 행 타입, 승인 완료 판정 — 화면과 분리한 **순수 함수** |
| `projectDocuments/TaxInvoiceStatsCard.tsx` | "세금계산서 통계" 카드 |
| `projectDocuments/PendingApprovalBox.tsx` | 상단 "내 결재함 - 승인 대기 중인 문서" 상자 |
| `projectDocuments/ProjectDocumentsTable.tsx` | 문서·품의서 통합 목록 표 |

- 필터 로직은 페이지 안의 긴 인라인 조건식에서 `filterTaxInvoices(docs, 조건)` 호출로 바뀌었다. 조건식은 그대로 옮겼다.
- 월 계산 함수가 `now`를 인자로 받게 해서(기본값은 현재 시각) 시점을 고정한 테스트가 가능하다.
- 테스트 추가(vitest, 10건): `documentHelpers.test.ts` — 품목 합계 반올림, 요약 문구, 통계(외화 제외·전월 대비·1월의 전월=작년 12월), 필터(매출/매입, 종이/전자, 발행 여부, 이번 달/지난달, 직접 기간, 자유 검색).
- 남은 큰 덩어리: 세금계산서 필터 바(약 110줄)와 각종 핸들러(다운로드·팝빌 등)는 이번에 옮기지 않았다.

## P4-5. 프로젝트 상세 페이지 분해 — 2026-10-16

`ProjectDetailPage.tsx`를 805줄 → **258줄**로 줄였다. 이 파일 안에 함께 들어 있던 컴포넌트와 계산 함수를 파일로 나눴고, **본문은 그대로 복사**했다.

| 신규 파일 | 내용 |
|---|---|
| `projects/timeline.ts` | 주차 계산, 진행 구간·오늘 위치, 주차 요약 문구, 종합 진행률(항목 평균을 10 단위로 반올림) — **순수 함수** |
| `projects/ProgressSectionCard.tsx` | "진행상황" 카드(주차 그리드 바, 진행율 선택, 기간 수정, 항목 추가·삭제) |
| `projects/ScheduleProgressCard.tsx` | 일정 + 종합 진행률 카드 |
| `projects/DocColumn.tsx`, `projects/salesDocGroups.ts` | 견적서/거래명세서 세트 목록 열, 세트 묶기 |

- 동작 동일: `weekSummary`의 "오늘 날짜 문자열" 만드는 코드만 공통 `toLocalISODate()` 호출로 바꿨다(결과 같음, 로컬 시간 기준).
- 테스트 추가(vitest, 10건): `timeline.test.ts` — 1주차 경계, 구간 잘라내기, 오늘 위치 비율(시각 고정), 주차 요약(시작 전/n주차/종료), 종합 진행률 10 단위 반올림.
- 사용하지 않게 된 import 는 tsc 오류 목록을 읽어 자동 정리하는 스크립트로 제거했다.

## P3-3. `project_documents.py` 분할 (06 분할안 1~6단계) — 2026-10-16 (사용자 승인)

1,155줄 파일을 패키지 `backend/app/routers/project_documents/`로 나눴다. **API 경로·요청/응답·오류 메시지는 그대로**이고 `main.py`도 바꾸지 않았다.

| 단계 | 내용 | 커밋 |
|---|---|---|
| 1 | 안전망 테스트 18건 추가(경로 목록 스냅샷, 세금계산서 승인→매입매출 기록과 재승인 갱신, 견적서+거래명세서 묶음 승인·반려, 삭제 결재 승인·반려, 재요청, 수정·삭제 조건) | `f56168c` |
| 2 | 파일 생성(`services/project_document_files.py`)과 세금계산서 장부 연동(`services/tax_invoice_ledger.py`)을 서비스로 이동 | `ba276ec` |
| 3~6 | 패키지로 분할: `_common.py`(공통), `listing.py`, `images.py`, `crud.py`, `files.py`, `popbill.py` | 이번 커밋 |

- 결과: 파일 7개, 가장 큰 파일은 `__init__.py`(313줄, 결재 코드)이다.
- **결재 코드는 의도적으로 `__init__.py`에 남겼다**(요청·승인·반려·삭제 결재와 보조 함수 8개). 위험이 가장 높아 06 분할안 7단계로 따로 승인받기로 했다.
- 이동은 스크립트로 수행했고(함수 본문 복사, 필요한 import만 의존성 분석으로 자동 생성), **이동 전후의 함수 39개 AST가 완전히 같고 데코레이터(경로·메서드·옵션)도 같음**을 비교로 확인했다.
- 테스트의 파일 생성 대체 지점을 `services.project_document_files.regenerate_documents`로 옮겼다.

## P3-4. `project_documents` 결재 코드 분리 (06 분할안 7단계) — 2026-10-16 (사용자 승인)

- 결재 코드(결재 요청, 승인·반려, 삭제 결재, 보조 함수 8개)와 `_apply_approval_request`를 `routers/project_documents/approval.py`(360줄)로 이동. `__init__.py`는 23줄(하위 라우터 조립만)이 되었다.
- 모듈 의존 방향: `crud → approval`(작성 시 결재 요청 적용), `approval → _common`. 하위 모듈끼리 순환 import 없음.
- 이동 전후 함수 39개 AST와 데코레이터가 동일함을 다시 확인했다. 06 분할안 1~8단계 완료.
- 최종 구성(줄 수): `approval` 360, `crud` 248, `_common` 125, `images` 137, `popbill` 113, `listing` 97, `files` 46, `__init__` 23 (원래 1,155줄 한 파일).

## P5(일부). 보안·설정: JWT 비밀키 기본값 방지, 로그 레벨 — 2026-10-16 (사용자 승인)

| 변경 | 내용 |
|---|---|
| 운영 환경 시작 점검 | 신규 `core/startup_checks.py`. `ENVIRONMENT=production`일 때 JWT 비밀키가 기본값(`dev-only-change-me` 등)이거나 32자 미만이면 **서버가 시작되지 않는다**(`RuntimeError`). 개발 환경(기본)에서는 경고 로그만 남기고 계속 진행한다. |
| 실행 환경 설정 | `config.py`에 `environment`(기본 `development`) 추가. `main.py` 시작 시 점검 호출(DB 연결 `try` 밖에 두어 오류가 삼켜지지 않게 함). |
| 로그 레벨 기본값 | 코드 기본값 `DEBUG` → `INFO`. 개발 PC는 `.env`의 `LOG_LEVEL=DEBUG`로 그대로 디버그 로그를 본다. |
| **로그 레벨 설정 버그 수정** | 기존 `logging_config.py`는 `os.getenv("LOG_LEVEL")`을 읽었는데 `.env` 파일은 환경변수로 로드되지 않아 **`.env`의 `LOG_LEVEL`이 무시되고 항상 DEBUG**였다. 이제 설정(`settings.log_level`)을 읽어 `.env`와 환경변수 둘 다 반영된다. 운영에서 `LOG_LEVEL`로 로그량을 줄일 수 있게 되었다. |
| 문서·예시 | `.env.example`에 `ENVIRONMENT`, `LOG_LEVEL`, 비밀키 생성 방법 추가 |

- 현재 개발 `.env`의 비밀키는 64자라 점검을 통과한다(값은 확인만 하고 출력하지 않음).
- 테스트 추가: `tests/test_startup_checks.py` 8건(기본값, 짧은 키, 운영 차단, 대소문자 무시, 운영 정상 시작, 개발 경고).
- **운영 서버 배포 시 해야 할 일**: `.env`에 `ENVIRONMENT=production`, 32자 이상의 임의 `JWT_SECRET_KEY`, 필요 시 `LOG_LEVEL=INFO`(또는 WARNING)를 지정한다. 비밀키를 바꾸면 기존 로그인 토큰은 무효가 되어 전원이 다시 로그인한다.

## P5(일부). 로그인 시도 제한 — 2026-10-16 (사용자 승인: 인증 정책 변경)

| 항목 | 내용 |
|---|---|
| 규칙 | 같은 **이메일**로 10분 안에 **5회** 실패하면 **5분간** 로그인 차단(맞는 비밀번호도 거절). 같은 **접속 주소(IP)**는 여러 계정 돌려 시도하는 공격을 막기 위해 **20회**로 더 느슨하게 적용. 로그인에 성공하면 그 이메일의 실패 기록 초기화. |
| 응답 | 차단 중에는 HTTP 429와 `Retry-After` 헤더, "약 N분 뒤에 다시 시도해주세요" 안내. 로그인 화면이 이 문구를 그대로 보여준다. |
| 설정 | `.env`로 조정 가능: `LOGIN_MAX_FAILURES`(5), `LOGIN_IP_MAX_FAILURES`(20), `LOGIN_WINDOW_SECONDS`(600), `LOGIN_LOCKOUT_SECONDS`(300) |
| 구현 | 신규 `core/login_throttle.py`(시계를 주입할 수 있어 시간 테스트 가능), `routers/auth.py`에서 비밀번호 확인 **전에** 잠금 여부 검사. 존재하지 않는 이메일도 똑같이 센다(계정 존재 여부 노출 방지). |
| 화면 | `LoginPage.tsx`: 429일 때 서버 안내 문구 표시(그 외 오류 문구는 그대로) |
| 테스트 | `tests/test_login_throttle.py` 12건(한도, 잠금 해제, 기간 밖 실패 제외, 대소문자·공백 무시, 다른 이메일·주소 영향 없음, 성공 시 초기화, API 429, 없는 이메일 동일 처리) |

### 한계와 주의사항
- 실패 기록은 **서버 프로세스 메모리**에만 있다. 서버를 재시작하면 초기화되고, 여러 프로세스로 띄우면 프로세스마다 센다. 5인 규모 단일 프로세스 운영을 전제로 한 단순한 구현이다.
- **프록시 뒤에서는 모든 사용자가 같은 IP로 보일 수 있다**(개발 서버의 Vite 프록시, 운영의 Nginx). 이 경우 IP 한도(20회/10분)는 전 직원의 실패를 합쳐서 센다. 5명 규모에서 정상 사용으로 넘기 어려운 값이지만, 운영 프록시를 구성할 때 실제 클라이언트 IP를 전달하는 설정(`X-Forwarded-For`)과 함께 검토해야 한다.
- 누군가 일부러 남의 이메일로 반복 실패시켜 5분간 잠그는 방해는 가능하다(잠금 시간을 짧게 둔 이유).

## P5(일부). 업로드 파일 내용 검사 — 2026-10-16 (사용자 승인)

- 문제: 업로드 검사가 브라우저가 보내는 `Content-Type` 헤더만 확인해서, 이름과 헤더만 `.png`로 바꾼 HTML·실행 파일도 저장될 수 있었다.
- 신규 `services/upload_check.py`: 파일 앞부분 서명(매직 바이트)으로 실제 형식을 판별하고 선언된 형식과 다르면 400 으로 거절한다. JPG·PNG·WEBP·GIF·PDF·오피스 문서(구버전 OLE / 신버전 zip)·zip 을 판별하고, 텍스트 파일은 NUL 바이트 없이 UTF-8 또는 CP949 로 읽히는지 확인한다. 빈 파일과 15MB 초과도 거절한다.
- 적용(9곳): 거래처 사업자등록증 인식·통장사본 인식·사업자등록증 1·2쪽·통장사본 첨부(`clients.py`), 입출금 영수증(`payments.py`), 품의서 첨부파일(`proposals.py`), 세금계산서 사진 인식·사진 등록(`project_documents/images.py`).
- 각 화면이 보여주던 기존 형식 오류 문구("이미지 파일(jpg, png, webp)만…" 등)는 **그대로 유지**했고, 내용 검사에서 걸릴 때만 "파일 내용이 ○○ 형식이 아닙니다" 문구가 새로 나온다.
- 함께 바뀐 것: 거래처 첨부·영수증에 **15MB 크기 제한이 새로 생겼다**(기존에는 무제한). 품의서 첨부의 저장 확장자는 사용자가 붙인 파일 이름 대신 확인된 형식에서 정한다(다운로드 때 보이는 원래 파일 이름은 그대로).
- 적용하지 않은 곳: 카드 명세서 CSV(`payments.py` import-csv)와 홈택스 엑셀(`transactions.py`)은 파일을 해석하는 단계에서 형식 오류가 걸러지므로 이번에는 그대로 두었다.
- 테스트: `tests/test_upload_check.py` 20건(형식 판별 9종, 정상 통과, HTML/실행 파일/형식 불일치/텍스트 위장 거절, 빈 파일·크기 초과, 영수증 API의 거절·저장·기존 문구 유지). 테스트는 임시 폴더에만 파일을 쓴다.

### 주의
- 형식 서명이 표준과 다른 파일(예: 앞에 공백이 붙은 PDF, 아이폰 HEIC 를 JPG 로 이름만 바꾼 파일)은 이제 거절된다. 이런 사례가 나오면 판별 규칙을 넓힐 수 있다.

## P5(일부). CORS 정리 — 2026-10-16 (사용자 승인)

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| 허용 주소 | 코드에 `localhost:5173`과 사무실 PC IP(`192.168.0.10:5173`)가 박혀 있음 | 기본 `localhost:5173`만. 추가는 `.env`의 `CORS_ORIGINS`(JSON 배열)로 |
| 허용 메서드 | 전부(`*`) | `GET`, `POST`, `PUT`, `DELETE` (실제로 쓰는 것만, PATCH 없음 확인) |
| 허용 헤더 | 전부(`*`) | `Authorization`, `Content-Type` |
| 자격 증명(쿠키) 허용 | 허용 | 허용 안 함 (인증은 Bearer 토큰 헤더, 쿠키 사용처 없음 확인) |

- **사무실 다른 PC 접속에는 영향이 없다.** 화면은 Vite 프록시(운영은 Nginx)를 거쳐 같은 주소로 API를 부르기 때문에 브라우저가 CORS 검사를 하지 않는다. 프록시가 다른 PC의 Origin 헤더를 그대로 넘겨도 요청은 정상 처리됨을 테스트로 확인했다. 그래서 서버 PC의 IP가 바뀌어도 이제 코드를 고칠 필요가 없다(README의 안내도 수정).
- 프론트엔드 코드에서 8000 포트를 직접 부르는 곳이 없음을 확인했다.
- 테스트: `tests/test_cors.py` 7건(허용 주소 사전 요청, 모르는 주소 거절, PATCH 거절, 목록에 없는 헤더 거절, 자격 증명 미허용, 같은 주소 요청 정상, 프록시가 넘긴 다른 Origin 요청 정상 처리).

## 데이터 정리: 거래처 잔액 재계산 — 2026-10-16 (사용자 확인)

- 사용자 확인: 지금까지 입력된 데이터는 모두 테스트 입력이다.
- 신규 `scripts/reconcile_client_balances.py`: 거래처 미수금/미지급금 잔액을 **미결제 매입매출 건의 남은 금액 합계**로 맞춘다. 기본은 미리보기이고 `--apply`를 붙여야 바꾸며, 바꾸기 전 잔액을 `backend/storage/backups/client_balances_*.json`으로 백업한다. 운영 데이터가 어긋났을 때도 같은 방식으로 점검할 수 있다.
- 개발 DB(`erp_db`) 적용 결과(18곳 중 3곳 변경):

| 거래처 | 변경 |
|---|---|
| ABC통신 | 미수금 0 → 1,000 |
| 델타 통신 | 미지급금 0 → 40,000 |
| 크레신 | 미지급금 0 → 50,000 |

- 다시 실행해 차이가 0곳임을 확인했다. 백업 파일: `backend/storage/backups/client_balances_20261016_142939.json`(storage 폴더라 git 에는 포함되지 않음).
- 테스트: `tests/test_reconcile_balances.py` 2건(남은 금액 합산, 결제완료 제외, 건 없는 거래처는 0).
- 원인이 된 동작(잔액만 줄이는 정산의 비대칭, 05-remaining-issues R2)은 그대로이므로, 같은 어긋남이 다시 생길 수 있다.

## 업무 규칙: 잔액보다 큰 잔액 정산 거절 — 2026-10-16 (사용자 승인, 05 문서 R2)

- 문제: 매입매출 건과 연결하지 않고 거래처 잔액만 줄이는 정산(분류 `외상매출금`/`외상매입금`/`미지급금`)에서 잔액보다 많이 입력하면 잔액이 0에서 멈췄다. 그 입출금을 삭제·수정하면 입력 금액 전체가 되살아나 **잔액이 실제보다 커졌다**(델타 통신·크레신 잔액이 어긋난 원인).
- 변경: 잔액보다 큰 금액은 처음부터 받지 않는다(400, "○○의 미지급금 잔액(₩…)보다 큰 금액은 미지급금 처리할 수 없습니다").
  - 등록: `services/settlement.py`의 `ensure_within_balance()`를 잔액 변경 전에 호출.
  - 수정: 같은 거래처·같은 잔액이면 기존 금액이 되돌려지는 것까지 감안해, **잔액을 바꾸기 전에** 검사한다(검사 실패 시 아무것도 바뀌지 않음).
  - 화면: 처리창(`SettleModal`)에서 연결된 건 없이 잔액만 줄이는 경우 미리 막고 안내. 입출금 등록 화면은 서버 안내 문구를 그대로 보여준다.
- 영향 없음: 매입매출 건에 연결된 결제(전액·부분)와 정산 분류가 아닌 일반 입출금.
- 테스트: 기존 "0에서 멈춤" 특성화 테스트를 새 규칙으로 바꾸고 4건 추가(초과 거절·잔액 불변, 잔액과 같은 금액 허용, 다른 분류 무관, 수정 시 되돌림 감안).

## P6(일부). Alembic 도입 1~4단계 — 2026-10-16 (사용자 승인)

자세한 결과는 [07-alembic-plan.md](07-alembic-plan.md) 8장.

- `backend/alembic/`, `alembic.ini`, 기준점 `alembic/versions/0001_baseline.py`(테이블 27, enum 22) 추가.
- `tests/conftest.py`: 테스트 DB 를 비우고 `alembic upgrade head` 로 만든다. `tests/test_alembic_schema.py`: 모델과 최신 리비전의 일치 검사.
- `models/payment.py`: 순환 외래키에 `use_alter=True`와 실제 DB 와 같은 이름 지정(DB 구조 변화 없음, 경고 제거).
- 개발 DB 는 **바꾸지 않았다.** 서버 시작 절차(`create_all` + 자동 스크립트)도 아직 그대로다(6단계).

## P6. Alembic 도입 5~7단계 — 2026-10-16 (사용자 승인)

자세한 결과는 [07-alembic-plan.md](07-alembic-plan.md) 9장.

- **개발 DB 변경**: 백업(`pg_dump`) 후 `alembic_version` 표 추가, 정리 리비전 `0002`로 예전 DB 기본값 19개 제거·NOT NULL 1개·인덱스 1개. 데이터 변경 없음(주요 테이블 행 수 확인).
- **서버 시작 절차 변경**: 시작할 때 `create_all`과 자동 마이그레이션 스크립트 3개를 더 이상 실행하지 않는다. `core/db_revision.py`로 리비전이 최신인지 확인만 한다(운영에서 최신이 아니면 시작 거부). `start.bat`가 먼저 `alembic upgrade head`를 실행한다.
- **기존 스크립트 50개**를 `scripts/legacy_migrations/`로 이동(실행·import 불가, 이력 보존).
- 문서: README에 "DB 구조 변경(Alembic)" 절, README·CLAUDE.md 수동 실행 방법에 `alembic upgrade head` 추가.
- 테스트: `tests/test_db_revision.py` 3건(최신이면 통과, 운영에서 오래된 DB 거부, 개발에서 경고).

## P5. 감사 로그 1~4단계 — 2026-10-16 (사용자 승인)

자세한 내용은 [08-audit-log-plan.md](08-audit-log-plan.md) 9장.

- 신규: `models/audit_log.py`, `alembic/versions/0003_audit_logs.py`, `core/audit.py`, `routers/audit_logs.py`, `schemas/audit_log.py`
- 변경: `main.py`(요청 정보 미들웨어, 조회 라우터 등록), `core/deps.py`(로그인 사용자를 기록 대상에 채움), `routers/auth.py`(로그인 성공·실패·차단 기록), `models/__init__.py`(모델 등록 + 자동 기록 연결)
- 기존 API의 요청·응답은 바뀌지 않았다. 쓰기 요청마다 감사 로그 행이 같은 트랜잭션에 추가된다.

## P3. 품의서 결재 단계 통합 1~3단계 — 2026-10-16 (사용자 승인)

자세한 내용은 [09-proposal-approval-merge-plan.md](09-proposal-approval-merge-plan.md) 9장.

- 신규: `alembic/versions/0004_proposal_target_type.py`, `0005_move_proposal_steps.py`, 테스트 3개 파일(`test_proposal_flows.py`, `test_migration_proposal_steps.py`, `test_proposal_steps_storage.py`)
- 변경: `models/approval_step.py`(`proposal` 대상 종류), `models/proposal.py`(`steps` 관계를 공용 테이블로, 옛 모델은 보존용), `routers/proposals.py`, `routers/notifications.py`, `services/proposal_pdf.py`, `schemas/proposal.py`
- 4단계(개발 DB 적용)도 같은 날 승인 후 완료: 백업 → 0005 까지 업그레이드 → 9행 일치 확인(09 문서 10장).

## S2. `proposals.py` 분할 — 2026-10-16

`project_documents` 분할과 같은 방법: 안전망 → 그대로 이동 → 비교.

| 새 파일 | 담당 |
|---|---|
| `routers/proposals/__init__.py` | 하위 라우터를 합쳐 `router` 로 내보냄(`main.py` 는 그대로) |
| `routers/proposals/_common.py` | 첨부 허용 형식, 조회 옵션, 문서 번호, 응답 변환, 자기결재 진행, 삭제 결재 보조 |
| `routers/proposals/listing.py` | 목록 |
| `routers/proposals/crud.py` | 작성, 수정, 삭제 |
| `routers/proposals/approval.py` | 승인·반려, 삭제 결재 요청 |
| `routers/proposals/files.py` | PDF 다운로드, 첨부 추가·다운로드·삭제 |
| `services/proposal_files.py` | PDF 생성(`_regenerate_pdf` → `regenerate_pdf`) |

- 함수 본문은 손대지 않았다. 유일한 변경은 PDF 생성 호출이 `proposal_files.regenerate_pdf(p)`로 바뀐 것(테스트에서 대체할 수 있도록 `project_document_files`와 같은 방식).
- 테스트: 분할 전에 API 경로 목록(12개, operationId 포함) 고정 테스트를 추가했다. 테스트의 PDF 생성 대체 대상만 새 위치로 바꿨다.
- 함께 고친 테스트: `test_audit_api_has_no_write_endpoints`가 `app.routes`를 읽었는데, 이 버전의 FastAPI 는 포함된 라우터의 경로를 거기 펼쳐 보여 주지 않아 **항상 통과**하고 있었다. OpenAPI 명세로 확인하도록 고쳤다(감사 로그 API 는 실제로 GET 만 있음).

## S3. `payments.py` 서비스 분리 — 2026-10-16

라우터는 요청 확인·응답 변환·commit 만 맡고, 장부 처리는 서비스가 맡는다(555 → 404줄).

| 새 위치 | 옮긴 것 |
|---|---|
| `services/card_pending.py` (신규) | 법인카드 결제예정: 등록 시 결제예정 여부, 수정 시 사용일 갱신/해제, 카드별 요약, 결제일 일괄 확정, 카드 명세서 행 추가 |
| `services/payment_query.py` (신규) | 목록 필터 쿼리, 미수금/미지급금 발생일, 월별 입금·출금 합계(결제예정 제외) |
| `services/settlement.py` `resettle_on_update` | 수정 시 거래처 잔액 재정산(검사 → 되돌림 → 새 거래처 확인 → 반영, 순서 그대로) |

- 목록 쿼리·발생일 함수는 본문이 원본과 AST 동일. 나머지는 구조만 바꾸고 순서·조건은 그대로.
- `card_pending` 모듈은 목록 API 의 `card_pending` 파라미터와 이름이 같아 라우터에서 `card_pending_service`로 불러온다.
- 안전망: `tests/test_payments_flows.py` 9건(API 경로 15개, 카드 결제예정 등록·요약·일괄확정·CSV·수정 시 해제, 월별 집계, 목록 필터, 수정 시 재정산·잔액 초과 거부·없는 거래처 거부). 분할 전 코드에서 먼저 통과시킨 뒤 커밋.

## S3. `transactions.py` 서비스 분리 + 세금계산서 판단 중복 통합 — 2026-10-16

| 변경 | 내용 |
|---|---|
| `services/transaction_query.py` (신규) | 목록 필터 쿼리(본문 AST 동일), 월별 공급가액·부가세 합계(부가세 리포트) |
| `services/tax_invoice_ledger.py` `invoice_amounts` (신규) | 세금계산서 (공급가액, 부가세) 계산. 매입매출 라우터의 `_doc_amounts`와 장부 자동 기록에 있던 같은 계산을 하나로 |
| 매출/매입 판단 | 같은 식이 3곳(매입매출 라우터 `_doc_is_sales`, 세금계산서 엑셀 양식, 장부 자동 기록)에 있던 것을 `is_sales_invoice` 하나로 |

- `tests/test_money.py`가 라우터의 `_doc_amounts`를 직접 불러오고 있어 새 위치로 바꿨다(검사 내용은 그대로).
- 안전망: `tests/test_transactions_flows.py` 6건(API 경로 10개, 목록 필터, 부가세 리포트, 연결 가능한 세금계산서 — 매출/매입 판단·품목별 반올림 금액·품목명 요약·제외 조건, 세금계산서 불러오기 등록·중복 거부, 부분 결제 후 합계 축소 거부).

## S4. 프론트엔드 폼 페이지 분해 — 2026-10-16

화면 코드(JSX)는 그대로 옮기고, 옮긴 부분을 원본과 공백 정규화 후 글자 단위로 비교해 같음을 확인했다(이름만 바뀐 prop 제외).

| 화면 | 줄 수 | 꺼낸 것 |
|---|---|---|
| 문서 작성 `ProjectDocumentFormPage` | 780 → 563 | `DocumentItemsEditor`(품목 입력 + 합계), `TaxInvoicePhotoSection`(세금계산서 사진 등록), `QuotationLoader`(견적서 불러오기), `documentForm.ts`(품목 변환·요청 값·금액·인식 상대방 — 중복 2곳씩 하나로) |
| 거래처 `ClientFormPage` | 709 → 551 | `ClientContactsEditor`(담당자 목록), `clientForm.ts`(사업자번호 형식, 폼↔API 변환, 이름 중복 비교, 사업자등록증 인식 결과 반영) |
| 입출금 `PaymentFormPage` | 579 → 441 | `TransactionPicker.tsx`(매입매출 불러오기 창, 원본 그대로), `OptionButtons`(카드·계좌·증빙의 같은 버튼 묶음 3곳), `paymentForm.ts`(입력 검사 — 순서·문구 그대로, 분류·항목 변환) |

- 꺼낸 순수 함수마다 vitest 를 붙였다(신규 18건).
- 화면 자동 테스트가 없으므로 아래를 직접 눌러 확인하는 것을 권한다.
  - 문서: 견적서 새로 작성(품목 추가·삭제, 단가 단위 변경), 거래명세서에서 견적서 불러오기, 세금계산서 사진 올리기·지우기, 반려 문서 수정
  - 거래처: 새 등록(사업자등록증·2쪽·통장사본 첨부), 수정, 담당자 추가·삭제, 같은 이름 경고
  - 입출금: 카드/계좌/증빙 버튼 선택(증빙은 다시 누르면 해제), 분류별 항목 입력, 매입매출 불러오기, 수정 화면 불러오기

## 버그 수정: 문서 금액 미리보기 반올림 — 2026-10-16 (`fc8955f`)

- 증상: 문서 작성·목록·상세 화면의 품목 금액이 `Math.round(수량 × 단가)`라 소수 곱셈 오차로 0.5 경계에서 서버와 달랐다. 예: 수량 15 × 단가 4.1 → 화면 61, 서버 저장 62. 수량 1~200 × 단가 0.05 단위(0.05~1,000) 400만 조합 중 7,603건이 어긋났다. 저장 금액은 서버가 계산하므로 장부는 맞았고 **화면 표시만** 틀렸다.
- 조치: `frontend/src/lib/money.ts`(서버 `services/money.py`와 같은 규칙, BigInt 정수 계산)를 만들고 문서 작성(품목·부가세), 목록·상세 합계, 매입매출 부가세 기본값이 이를 쓰게 했다. 상세 창에 따로 있던 `itemsTotal`·`formatDocAmount` 복사본은 `documentHelpers`의 것을 쓰도록 정리.
- 테스트: 위 400만 조합 전 구간에서 정수 계산과 일치(0건 어긋남), 사사오입·음수·부가세 경계.

## S5. 프론트엔드 린트 경고 정리 (10 → 0) — 2026-10-16 (`1f5238c`)

| 위치 | 경고 | 바꾼 방법 (동작 동일) |
|---|---|---|
| `AuthContext` | 토큰이 없을 때 effect 안에서 `setIsLoading(false)` | 처음부터 `isLoading = 저장된 토큰이 있는지`로 시작 |
| `AuthContext` | 컴포넌트 파일이 훅도 내보냄(빠른 새로고침) | `useAuth`·컨텍스트 객체를 `context/useAuth.ts`로 옮기고 import 21곳 변경 |
| `ClientCombobox`, `ProjectSearchBox` | 입력값·열림이 바뀔 때 effect 로 선택 위치 초기화 | 렌더 중 조정(이전 값과 비교해 바뀌면 초기화) — React 문서의 "렌더 중 상태 조정" 방식 |
| `EventFormModal` (3곳) | 윤달·날수·음력 반복을 effect 로 보정 | 같은 조건을 렌더 중에 보정 |
| `TransactionFormPage` | 공급가액이 바뀌면 effect 로 부가세 자동 계산 | 렌더 중 조정(공급가액·수동 수정 여부가 바뀔 때만) |
| `PaymentFormPage` | 결제수단이 바뀌면 effect 로 증빙·계좌·카드 선택 비움 | 결제수단을 바꾸는 곳(선택 상자, 매입매출 불러오기)의 `changeMethod`에서 바로 비움. 수정 화면 불러오기는 서버 값이 이미 결제수단과 맞으므로 그대로 |
| `ProposalsPage` | 알림으로 들어오면 effect 로 상세 열기 | 렌더 중 조정(한 번만 열리도록 상태로 기억) |

화면 직접 점검 권장: 로그인/로그아웃·새로고침 시 로그인 유지, 거래처·프로젝트 자동완성 키보드 이동, 일정 등록(음력·윤달·반복), 매입매출 부가세 자동 계산, 입출금 결제수단 변경, 업무 알림에서 품의서 열기.

## R5. 결제된 매입매출 삭제 시 거래처 잔액이 되살아나는 버그 — 2026-10-16 (`495283d`)

- 재현: 외상 매출 1,100,000 → 입출금으로 결제(부분 400,000 또는 전액) → 매입매출 삭제 → 그 입출금 삭제. 받을 돈이 없는데 미수금이 **400,000(부분) / 1,100,000(전액)** 으로 남았다.
- 원인: 매입매출이 지워지면 입출금의 연결(외래키)이 비워져, 입출금 삭제 때 "거래처 잔액만 줄인 정산"으로 취급되어 잔액을 되돌렸다.
- 조치:
  - 매입매출 삭제: 결제한 입출금(전액·부분)이 남아 있으면 400 과 함께 "입출금관리에서 먼저 삭제해주세요" 안내. 입출금을 먼저 지우면 외상으로 돌아오고, 그다음 삭제하면 잔액 0. 기존 동작을 고정했던 테스트(부분 결제 후 삭제 허용)는 새 규칙으로 바꿨다.
  - 세금계산서 삭제 결재(원래 매입매출·전액 결제 입출금을 함께 삭제): 부분 결제 입출금도 함께 삭제.
  - 매입매출 화면: 삭제가 거절되면 아무 말 없이 넘어가던 것을 사유를 보여주도록.
- 개발 DB: 이 경로로 이미 어긋난 입출금은 없음(읽기 전용 확인).

## O7. 팝빌 통신 안전장치 — 2026-10-16

- 문제: 팝빌 SDK(`popbill`)와 인증 토큰 SDK(`linkhub`)가 타임아웃 없이 HTTPS 연결을 만든다(SDK 의 `timeOut=180`은 연결 재사용 시간일 뿐). 팝빌 서버가 응답하지 않으면 요청이 끝나지 않고 서버 작업 스레드가 묶인다.
- 조치: `services/popbill_service.py`가 두 SDK 모듈 안에서만 연결 생성에 기본 타임아웃을 넣는다(전역 `http.client`는 그대로). 기본 30초, `.env`의 `POPBILL_TIMEOUT_SECONDS`로 조정. 통신 실패·시간 초과는 504 와 안내 문구로 응답 — 발행은 "이미 처리됐을 수 있으니 팝빌에서 확인 후 다시 발행" 안내.
- 재시도: 넣지 않았다. 발행(`registIssue`)은 같은 관리번호로 다시 보내면 중복 오류가 나므로 자동 재시도가 위험하다. 조회(보기/PDF URL)는 사용자가 다시 누르면 된다.
- 같이 정리: 팝빌 전용 부가세 계산 `_round_tax`를 공통 `vat_amount`로(정수 공급가 0~200,000 등에서 결과 동일 확인).
- 테스트 4건: SDK 연결 타임아웃·전역 영향 없음, 부가세 동일, 보기/PDF URL 시간 초과 → 504.

## S8. 화면 안의 확인 창·알림 (B안) — 2026-10-16 (`9d08d9c`)

시안 페이지에서 사용자가 B안(확인은 가운데 창, 안내는 오른쪽 아래 알림)을 골랐다.

- 공통 부품 `components/ui/dialog/`: `DialogProvider`(앱 맨 위, `main.tsx`), `useDialog()` → `confirm` / `prompt` / `notify` / `notifyError`.
  - 확인·입력: 가운데 창. 되돌릴 수 없는 일(삭제, 연차 신청 취소, 반려)은 빨간 버튼 + 처음 초점이 [취소]. Esc·바깥 클릭 = 취소. 입력 창은 Enter = 확인, Shift+Enter = 줄바꿈, 빈 칸이면 "내용을 입력해주세요".
  - 안내: 오른쪽 아래. 완료는 4초 뒤 사라지고, 오류와 직접 할 일이 있는 안내(담당자 이메일 없음)는 닫을 때까지 남는다. 페이지를 옮겨도 남는다(앱 맨 위에 그림).
- 바꾼 곳 36곳(확인 18, 안내 17, 입력 1). **문구는 그대로**이고 확인 버튼 이름만 동작에 맞췄다(삭제·신청 취소·승인·발행·출금 처리·삭제 결재 요청·저장/등록·반려).
- 화면 직접 점검 권장: 거래·입출금·문서·공지·일정·거래처 삭제, 연차 신청/취소, 결재 승인·반려(사유 입력), 카드 일괄 출금, 팝빌 발행, 같은 이름 거래처 경고, 문서·품의서 결재 요청 완료 안내.

## S7. 화면별 코드 분할 — 2026-10-16 (`377ed71`)

- 로그인·대시보드·모바일 홈만 첫 JS 에 두고, 나머지 30개 화면은 `React.lazy`로 처음 열 때 받는다. 로그인한 뒤 브라우저가 한가할 때(`requestIdleCallback`) 나머지 화면을 미리 받아 두어 메뉴를 옮길 때 기다림이 거의 없다. 받는 동안은 "불러오는 중..."
- 결과: 첫 JS **1,022KB → 367KB** (gzip 284 → 102KB). 음력·공휴일 라이브러리(308KB)는 일정 화면에서만 받는다.
- 글꼴 파일이 많아 보이는 것은 글자 범위별로 나뉜 파일이라, 브라우저가 화면에 쓰인 글자 묶음만 받는다(정리 대상 아님).

## S6. 목록 API 크기 측정 — 2026-10-16

개발 DB(대표 계정, GET 만, 정기 자동이체 기록은 막고) 측정. 지금은 페이지 나누기가 필요 없다. 페이지 나누기는 API 응답 형식과 화면을 함께 바꿔야 하므로 아래 기준에 도달하면 진행한다.

| 목록 | 건수 | 응답 크기 | 시간(두 번째 호출) | 쿼리 수 |
|---|---|---|---|---|
| 문서관리 | 37 | 36.8KB | 35ms | 2 |
| 매입매출 | 36 | 17.2KB | 9ms | 4 |
| 입출금 | 23 | 10.0KB | 30ms | 3 |
| 거래처 | 18 | 9.6KB | 9ms | 1 |

다시 볼 기준: 목록 하나가 2,000건 또는 1MB 이상, 또는 응답 300ms 이상.
(측정 중 한 번은 정기 자동이체 기록을 막지 않은 채 입출금 목록을 불렀다. 활성 자동이체가 0건이라 기록된 것은 없음을 확인했다.)

## S10. 화면(컴포넌트) 자동 테스트 — 2026-10-16 (`dcf3856`)

- 개발 전용 의존성(버전 고정): `@testing-library/react` 16.3.0, `@testing-library/dom` 10.4.0, `@testing-library/user-event` 14.6.1, `jsdom` 26.1.0. `npm audit` 취약점 0.
- `*.test.tsx` 파일은 첫 줄 `// @vitest-environment jsdom`으로 브라우저 흉내 환경에서, 순수 함수 테스트는 그대로 node 에서 돈다.
- 신규 13건: 확인 창·입력 창·알림(초점, Esc, 빈 사유, 4초 뒤 사라짐/오류는 남음), 품목 입력(사사오입 합계, 추가·삭제 조건, 단가 단위), 선택 버튼, 담당자 목록.

## O8. 정기 백업 스크립트 — 2026-10-16

- `backup.bat` → `app/scripts/backup_db.py --with-files`. DB 는 `pg_dump -Fc` 후 `pg_restore -l`로 표 데이터가 있는지 확인, 첨부 파일은 `storage` 를 zip(백업 폴더 제외). 30일 지난 **자기 형식 파일만** 정리. 비밀번호는 명령줄이 아니라 환경변수로만 넘긴다. 실패하면 종료 코드 1.
- 작업 스케줄러 등록 명령과 복원 방법은 README "백업과 복원". 등록 자체는 하지 않았다(서버 설정 변경이라 직접 실행).
- 실제 실행: DB 124KB(표 데이터 28), 첨부 파일 97개 약 40MB. **복원 확인**: 이 백업을 테스트 DB(`erp_test`)에 복원해 표 28개의 행 수가 개발 DB 와 모두 같음, 리비전 0006 확인(테스트 DB 는 다음 테스트 실행 때 새로 만들어진다).
- 테스트 3건: 비밀번호가 명령줄에 없음, 오래된 자기 파일만 정리(수동 백업 보존), zip 이 백업 폴더를 빼고 묶음.
