"""품의서 API. 하위 모듈의 라우터를 하나로 합쳐 `router` 로 내보낸다.

경로는 모두 /api/proposals 로 시작한다. 모듈 구성:
  listing   목록
  crud      작성, 수정, 삭제
  approval  승인·반려, 삭제 결재 요청
  files     PDF 다운로드, 첨부 추가·다운로드·삭제
PDF 생성은 services/proposal_files.py 에 있다.
"""
from fastapi import APIRouter

from app.routers.proposals import approval, crud, files, listing

router = APIRouter()

# 경로가 서로 겹치지 않으므로 포함 순서는 동작에 영향이 없다.
router.include_router(listing.router)
router.include_router(crud.router)
router.include_router(approval.router)
router.include_router(files.router)
