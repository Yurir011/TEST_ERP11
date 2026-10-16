# 03. 수정 내역

> 단계가 끝날 때마다 이 문서에 추가한다. 각 단계는 독립 커밋으로 구분한다.

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
