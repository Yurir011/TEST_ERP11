"""문서관리(견적서·거래명세서·세금계산서·발주서) API. 하위 모듈의 라우터를 하나로 합쳐 `router` 로 내보낸다.

경로는 모두 /api/project-documents 로 시작한다. 모듈 구성:
  listing   목록, 세금계산서 목록 엑셀
  images    세금계산서 이미지 업로드·조회·삭제, 사진 인식(OCR)
  crud      작성, 견적서+거래명세서 묶음 작성, 수정, 삭제
  approval  결재 요청, 승인·반려, 삭제 결재
  files     PDF·엑셀 다운로드
  popbill   팝빌 전자세금계산서 발행·조회
"""
from fastapi import APIRouter

from app.routers.project_documents import approval, crud, files, images, listing, popbill

router = APIRouter()

# 하위 라우터를 원래 선언 순서에 가깝게 포함한다 (고정 경로는 /{doc_id} 계열과 겹치지 않는다).
router.include_router(listing.router)
router.include_router(images.router)
router.include_router(crud.router)
router.include_router(approval.router)
router.include_router(files.router)
router.include_router(popbill.router)
