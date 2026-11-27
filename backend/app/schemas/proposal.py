from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.approval_step import ApprovalStepStatus
from app.models.proposal import ProposalAttachmentKind, ProposalStatus
from app.models.user import JobTitle
from app.schemas.material import ReceiveStockLine


class ProposalCreate(BaseModel):
    kind: str | None = None
    title: str
    topic: str
    content: str
    vendor_name: str | None = None  # 거래처명 (구매 품의서)
    project_id: int | None = None  # 속한 프로젝트 (없으면 일반 구매)
    amount: float | None = Field(default=None, ge=0)  # 금액
    currency: Literal["KRW", "USD", "JPY"] = "KRW"
    issue_date: date | None = None  # 기안일자. 비우면 오늘
    is_final_decision: bool = False
    end_title: JobTitle | None = None  # 결재선 종료 단계 (부서장/팀장/대표). 전결이면 불필요
    approver_ids: list[int] = Field(default_factory=list)  # 부서장부터 end_title까지의 단계 수만큼, 순서대로. 전결이면 불필요

    @field_validator("approver_ids")
    @classmethod
    def validate_length(cls, v: list[int]) -> list[int]:
        if len(v) > 3:
            raise ValueError("결재자는 3명 이하로 지정해야 합니다.")
        return v


class ProposalAmountIn(BaseModel):
    """승인된 품의서의 금액만 바꿀 때 사용 (입출금 권한자). 외화 건은 amount 가 참고용 외화 금액이고,
    실결제 원화 금액·환율·부가세 없음을 함께 보내면 장부(원화)도 같이 바뀐다."""

    amount: float = Field(ge=0)
    settle_amount: int | None = Field(default=None, gt=0)
    settle_rate: float | None = Field(default=None, gt=0)
    no_vat: bool = True


class ProposalSettlementIn(BaseModel):
    """외화 구매의 실결제: 제반 비용 포함 실제 결제된 원화 금액과 적용 환율(수기 입력), 부가세 없음 여부."""

    settle_amount: int = Field(gt=0)
    settle_rate: float = Field(gt=0)
    no_vat: bool = True
    payment_date: date | None = None  # 이미 결제한 건의 자동 출금 날짜를 유지하려고 쓴다 (보통 비움)


class ProposalDeleteRequestIn(BaseModel):
    """승인된 품의서의 삭제 결재를 요청할 때 사용 (결재선은 새로 지정한다)."""

    is_final_decision: bool = False
    end_title: JobTitle | None = None
    approver_ids: list[int] = Field(default_factory=list)


class RejectIn(BaseModel):
    reason: str


class ProposalLinkAttachmentIn(BaseModel):
    url: str = Field(min_length=1)
    label: str | None = None


class AttachmentDocKindIn(BaseModel):
    """첨부 파일의 서류 종류를 정하거나(statement / tax_invoice / invoice) 비운다(null = 기타)."""

    doc_kind: str | None = None


class ProposalAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: ProposalAttachmentKind
    label: str
    url: str | None
    doc_kind: str | None = None  # 서류 종류: statement(거래명세서) / tax_invoice(세금계산서) / invoice(인보이스) / None(기타)
    created_by: int
    created_at: datetime


class ProposalStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    step_order: int
    title: JobTitle
    approver_id: int
    approver_name: str
    status: ApprovalStepStatus
    decided_at: datetime | None


class OrderPaymentIn(BaseModel):
    """발주 건의 결제 확인: 입금(deposit) / 법인카드(card + 카드 종류) / 둘 다 아니면 미입금(null)."""

    payment_method: Literal["deposit", "card"] | None = None
    payment_card: str | None = None  # 카드·계좌 관리의 카드 code
    payment_bank: str | None = None  # 카드·계좌 관리의 계좌 code


class ProposalPaymentIn(BaseModel):
    """결제 내역 한 줄 추가: 입금(계좌) 또는 법인카드(카드)로 amount 원."""

    payment_method: Literal["deposit", "card"]
    account: str  # 카드·계좌 관리의 계좌/카드 code
    amount: int = Field(gt=0)
    payment_date: date | None = None  # 결제한 날 (없으면 오늘)


class ProposalPaymentOut(BaseModel):
    """품의서의 결제 내역 한 줄 (입출금관리의 출금과 같다)."""

    id: int
    payment_date: date
    method: str  # deposit(계좌이체) / card(법인카드) / cash / other
    account: str | None = None  # 계좌 또는 카드 code
    amount: int


class OrderFlowToggle(BaseModel):
    """발송 확인·입고 확인을 켜거나(true) 취소(false)한다."""

    value: bool
    online: bool = False  # 발송 확인에서만 사용: 온라인 주문처럼 발주서 없이 "발주 완료"로 처리한다
    payment_method: Literal["deposit", "card"] | None = None  # 발송 확인·입고 확인에서 대금 결제 상태: 입금 / 법인카드 / (없으면 외상)
    payment_card: str | None = None
    payment_bank: str | None = None
    payment_asked: bool = False  # 입고 확인에서만 사용: true 면 위 결제 상태로 바꾼다 (입고 때 대금 결제 여부를 물어 본 경우)
    received_date: date | None = None  # 입고 확인에서만 사용: 실제로 물품을 받은 날 (없으면 오늘)
    payment_date: date | None = None  # 입고 확인에서만 사용: 대금을 결제한 날 (없으면 오늘)
    materials: list[ReceiveStockLine] = Field(default_factory=list, max_length=100)  # 입고 확인에서만 사용: 재고에 넣을 자재와 개수


class ReceivedDateIn(BaseModel):
    """입고 처리된 건의 입고 날짜를 고친다."""

    received_date: date


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_no: str
    kind: str | None
    title: str
    topic: str
    content: str
    vendor_name: str | None = None
    project_id: int | None = None
    project_name: str | None = None
    project_round: str | None = None  # 프로젝트에 회차 탭이 있을 때 지정한 회차 이름 (직접 지은 이름 또는 "N회차")
    amount: float | None = None
    currency: str = "KRW"
    settle_amount: int | None = None  # 외화 구매의 실결제 원화 금액
    settle_rate: float | None = None  # 적용 환율
    no_vat: bool = False
    department_name: str
    issue_date: date
    status: ProposalStatus
    current_step: int
    is_final_decision: bool
    created_by: int
    creator_name: str
    steps: list[ProposalStepOut]
    attachments: list[ProposalAttachmentOut]
    has_pdf: bool
    reject_reason: str | None
    delete_requested: bool = False
    order_sent_at: datetime | None = None
    order_sent_by: int | None = None
    payment_method: str | None = None
    payment_card: str | None = None
    payment_bank: str | None = None
    # 결제 내역(부분 결제): 발주 완료된 원화 품의서만 값이 있다. payable_total 은 부가세 포함 결제할 금액
    payable_total: int | None = None
    payments: list[ProposalPaymentOut] = []
    received_at: datetime | None = None
    received_by: int | None = None
    created_at: datetime
