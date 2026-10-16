# 모든 모델을 여기서 import 해야 Base.metadata 에 등록된다 (서버 시작 시 테이블 확인과 Alembic 자동 비교가 이 목록을 쓴다).
from app.models.approval_step import ApprovalStep
from app.models.attendance import Attendance
from app.models.client import Client
from app.models.document import DocumentIssue
from app.models.document_set import DocumentSet
from app.models.leave import LeaveRequest
from app.models.notice import Notice
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.recurring_payment import RecurringPayment, RecurringPaymentRun
from app.models.project import Project
from app.models.project_document import ProjectDocument, ProjectDocumentImage, ProjectDocumentItem
from app.models.proposal import Proposal, ProposalApprovalStep, ProposalAttachment
from app.models.project_progress import ProjectProgressStage, ProjectPurchaseStep
from app.models.sales_document import SalesDocument, SalesDocumentItem
from app.models.schedule import ScheduleEvent
from app.models.todo import TodoItem
from app.models.transaction import Transaction
from app.models.user import User

__all__ = [
    "User",
    "Notice",
    "Notification",
    "Attendance",
    "LeaveRequest",
    "DocumentIssue",
    "Client",
    "Project",
    "ProjectDocument",
    "ProjectDocumentItem",
    "ProjectDocumentImage",
    "Proposal",
    "ProposalApprovalStep",
    "ProposalAttachment",
    "ProjectProgressStage",
    "ProjectPurchaseStep",
    "DocumentSet",
    "SalesDocument",
    "SalesDocumentItem",
    "Transaction",
    "Payment",
    "RecurringPayment",
    "RecurringPaymentRun",
    "ScheduleEvent",
    "TodoItem",
]
