"""품의서 PDF 파일 생성 (라우터에서 호출한다). 파일 경로는 품의서(file_path)에 기록하고 commit 은 호출한 쪽이 한다."""
import os

from app.config import settings
from app.logging_config import get_logger
from app.models.proposal import Proposal
from app.services.proposal_pdf import generate_proposal_pdf

logger = get_logger("Proposals")


def regenerate_pdf(p: Proposal) -> None:
    pdf_bytes = generate_proposal_pdf(p)
    os.makedirs(settings.proposals_dir, exist_ok=True)
    file_path = os.path.join(settings.proposals_dir, f"{p.id}_proposal.pdf")
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)
    p.file_path = file_path
    logger.debug(f"[Proposals] PDF 생성: id={p.id}, status={p.status}, step={p.current_step}")
