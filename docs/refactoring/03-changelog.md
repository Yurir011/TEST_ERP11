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
