# 06. `project_documents.py` 분할안

> 작성일: 2026-10-16 · 대상: `backend/app/routers/project_documents.py` (1,155줄, 함수 44개)
> 상태: **1~6단계 완료(2026-10-16)**, 7단계(결재 코드를 `approval.py`로 이동)는 별도 승인 대기. 결과는 [03-changelog.md](03-changelog.md) P3-3 참고.

## 1. 현재 구조

한 파일 안에 아래 여섯 가지 일이 섞여 있다.

| 영역 | 줄 범위(대략) | 내용 |
|---|---|---|
| 공통 | 1–160 | 상수·라벨, 응답 변환(`_to_out*`), 조회(`_get_doc_or_404`), 문서 링크, 삭제 라벨 |
| 파일 생성 | 369–409 | PDF·엑셀·양식 채우기 호출(`_regenerate_*`) |
| 장부 연동 | 167–229 | 세금계산서 승인 시 매입매출 자동 기록(`_record_tax_invoice_transaction`) |
| 목록·조회 | 413–485 | 목록, 세금계산서 목록 엑셀 |
| 작성·수정·삭제 | 289–354, 604–731, 1137–1159 | 거래처·프로젝트 찾기, 새 문서 만들기, 묶음(세트) 생성, 수정, 즉시 삭제 |
| 이미지·OCR | 488–600 | 세금계산서 이미지 업로드, 인식, 조회, 삭제 |
| 결재 | 232–286, 735–1009 | 결재 요청, 승인·반려(묶음 문서 포함), 삭제 결재 요청·승인·반려 |
| 파일 다운로드 | 1013–1039 | PDF·엑셀 다운로드 |
| 팝빌 | 1042–1133 | 발행 가능 검사, 필수 정보, 발행, 보기·PDF 주소 |

## 2. 제안하는 구조

API 경로, 요청·응답, 오류 메시지는 **전혀 바꾸지 않는다.** 한 개의 `router`로 합쳐 `main.py`는 수정하지 않는다.

```
backend/app/routers/project_documents/
  __init__.py     router = APIRouter(prefix="/api/project-documents") 에 아래 하위 라우터를 원래 순서대로 포함
  _common.py      상수·라벨, _to_out*, _get_doc_or_404, _set_siblings, _doc_link, _delete_label
  listing.py      GET 목록, GET /export/tax-invoices-excel
  images.py       POST /ocr/tax-invoice, 이미지 업로드·조회·삭제
  crud.py         POST 생성, POST /set, PUT 수정, DELETE (+ _new_document, _resolve_project, _find_client)
  approval.py     POST request-approval, PUT approve·reject, POST request-delete (+ _approve_one, _reject_one,
                  _apply_approval_request, _delete_document_now, _restore_after_delete_rejected)
  files.py        GET pdf, GET excel
  popbill.py      팝빌 4개 엔드포인트 (+ _check_popbill_issuable)

backend/app/services/
  project_document_files.py   _regenerate_pdf / _excel / _from_template / _documents (파일 생성 묶음)
  tax_invoice_ledger.py       _record_tax_invoice_transaction (세금계산서 ↔ 매입매출 연동)
```

예상 결과: 가장 큰 파일이 결재(`approval.py`, 약 330줄)이고 나머지는 100~200줄 안팎이다.

### 라우트 순서
FastAPI는 선언 순서대로 경로를 맞춘다. `/set`, `/export/...`, `/ocr/...`처럼 고정 경로가 `/{doc_id}`보다 먼저 선언되어야 하는 경우를 지키기 위해 **하위 라우터를 현재 선언 순서 그대로 포함**한다. 분할 전·후의 (메서드, 경로) 목록이 같은지 테스트로 확인한다.

## 3. 위험과 대응

| 위험 | 대응 |
|---|---|
| 라우트가 빠지거나 순서가 바뀜 | 분할 **전에** 현재 (메서드, 경로) 목록을 테스트로 고정하고, 매 단계 후 같은지 확인 |
| 모듈 간 순환 import (`_common` ↔ `approval`) | 공통 함수는 `_common.py`·서비스로만 두고 하위 라우터끼리는 서로 import 하지 않는다 |
| 테스트가 가리키는 함수 위치가 바뀜 | 테스트의 `monkeypatch` 대상을 새 위치(`services.project_document_files`)로 함께 수정 |
| 결재 후 파일 재생성 순서(commit → 재생성 → commit) 변경 | 코드를 **그대로 이동만** 하고 순서를 바꾸지 않는다 |
| 승인 시 매입매출 자동 기록, 묶음 문서 승인, 삭제 결재가 테스트되지 않음 | 아래 4장의 테스트를 **먼저** 추가한 뒤 이동 |

## 4. 이동 전에 추가할 테스트 (안전망)

현재 결재 테스트는 "견적서 2단계 승인·반려"뿐이다. 이동 전에 다음을 추가한다(외부 연동·파일 생성은 대체).

1. 라우트 목록 스냅샷: `/api/project-documents` 하위 (메서드, 경로) 전체
2. 세금계산서 승인 → 매입매출 자동 기록(매출/매입 구분, 공급가액·부가세, 연결 id)
3. 승인된 세금계산서를 수정해 재승인 → 기존 매입매출 내역이 갱신되는지
4. 견적서+거래명세서 세트: 한 번의 승인·반려로 묶음 전체가 함께 처리되는지
5. 삭제 결재: 최종 승인 시 문서와 연결된 매입매출 삭제, 반려 시 승인 상태 복원
6. 반려 문서 재요청(결재 요청 다시 보내기)
7. 문서 수정 가능 조건, 즉시 삭제 가능 조건(상태별)

## 5. 진행 단계 (각 단계마다 테스트 실행 + 독립 커밋)

| 단계 | 작업 | 위험 |
|---|---|---|
| 1 | 안전망 테스트 추가(4장). 코드 변경 없음 | 낮음 |
| 2 | 서비스 분리: `project_document_files.py`, `tax_invoice_ledger.py`로 함수 이동 | 낮음 |
| 3 | 패키지 전환: `project_documents.py` → `project_documents/__init__.py` (내용 그대로) + 라우트 스냅샷 확인 | 낮음 |
| 4 | `_common.py` 추출 | 중간 |
| 5 | 읽기 전용부터 분리: `listing.py`, `files.py`, `popbill.py`, `images.py` | 낮음~중간 |
| 6 | `crud.py` 분리 | 중간 |
| 7 | `approval.py` 분리(가장 마지막) | 높음 |
| 8 | 문서 갱신(03·04·05), 미사용 import 점검 | 낮음 |

중간에 테스트가 하나라도 실패하면 그 단계를 되돌리고 원인을 보고한다.

## 6. 이번 분할에서 하지 않는 것

- 품의서(`proposals.py`, 647줄) 분할 — 별도 승인 대상
- 결재 로직의 의미 변경, API 변경, DB 변경
- 팝빌 호출의 타임아웃·재시도 정책 변경(분석에서 "미확인"으로 남긴 항목이며 별도 검토)

## 7. 승인 요청

1. 위 구조와 단계로 진행해도 되는지
2. 단계 7(결재 분리)은 위험이 높으니 **단계 1~6만 먼저 하고 결과를 보고한 뒤** 7을 따로 승인받는 방식이 좋을지
