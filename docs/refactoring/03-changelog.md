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
| P5(일부) | 로그인 시도 제한(5회 실패 시 5분 잠금) | 이번 커밋 |

사용자에게 보이는 **동작이 바뀐 것**은 세 가지이며 모두 승인을 받았다: ① 부가세·품목 금액 반올림(사사오입), ② 오늘 날짜 기본값(로컬 시간), ③ 로그인 실패 반복 시 일시 잠금. 나머지는 구조 정리이며 API 경로·화면·DB 스키마는 바뀌지 않았다. DB 컬럼 추가(`paid_amount` 등)는 리팩토링 이전의 부분 결제 기능 작업에서 이뤄졌다.

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
