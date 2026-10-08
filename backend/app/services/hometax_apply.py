"""홈택스 엑셀에서 읽은 세금계산서를 매입매출 내역으로 바꾸는 계획(미리보기)과 실제 적용."""
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.logging_config import get_logger
from app.models.client import Client
from app.models.project_document import (
    MAX_ITEMS,
    ProjectDocType,
    ProjectDocument,
    ProjectDocumentItem,
    ProjectDocumentStatus,
)
from app.models.transaction import Transaction, TransactionType
from app.services.hometax_import import HometaxInvoice, HometaxItem, digits_only, format_reg_no, is_valid_reg_no

logger = get_logger("HometaxImport")


@dataclass
class PlanRow:
    approval_no: str
    transaction_date: date | None
    type: TransactionType | None
    counterparty_name: str
    counterparty_reg_no: str  # 하이픈 포함 표기 (없으면 빈 문자열)
    counterparty_ceo: str
    counterparty_addr: str
    item_name: str
    supply: int
    vat: int
    status: str  # new | duplicate | error
    message: str
    client_action: str  # existing | create | none
    client_id: int | None = None
    purpose: str = ""  # 영수 / 청구
    items: list[HometaxItem] = field(default_factory=list)


def _our_reg_no() -> str:
    return digits_only(settings.company_reg_no)


def build_plan(db: Session, invoices: list[HometaxInvoice]) -> list[PlanRow]:
    ours = _our_reg_no()
    # 직접 입력한 번호에 하이픈이 있어도 같은 번호로 보도록 숫자만 남겨 비교한다.
    existing_numbers = {
        digits_only(n) for (n,) in db.query(Transaction.tax_invoice_no).filter(Transaction.tax_invoice_no.isnot(None)).all()
    }
    # 문서관리의 세금계산서(직접 발행/등록한 것)도 같은 번호로 보고 중복 처리한다. 이 문서들은 이미 매입매출에 연동되어 있다.
    for approval, nts in (
        db.query(ProjectDocument.approval_no, ProjectDocument.popbill_nts_confirm_num)
        .filter(ProjectDocument.doc_type == ProjectDocType.tax_invoice)
        .all()
    ):
        for n in (approval, nts):
            if n:
                existing_numbers.add(digits_only(n))
    clients_by_reg = {}
    for c in db.query(Client).all():
        d = digits_only(c.biz_reg_no)
        if d and d not in clients_by_reg:
            clients_by_reg[d] = c

    plan: list[PlanRow] = []
    for inv in invoices:
        row = PlanRow(
            approval_no=inv.approval_no,
            transaction_date=inv.write_date,
            type=None,
            counterparty_name="",
            counterparty_reg_no="",
            counterparty_ceo="",
            counterparty_addr="",
            item_name="",
            supply=inv.supply or 0,
            vat=inv.vat or 0,
            status="new",
            message="",
            client_action="none",
            purpose=inv.purpose if inv.purpose in ("영수", "청구") else "청구",
            items=inv.items,
        )

        if inv.supplier_reg == ours:
            row.type = TransactionType.sales
            name, reg, ceo, addr = inv.buyer_name, inv.buyer_reg, inv.buyer_ceo, inv.buyer_addr
        elif inv.buyer_reg == ours:
            row.type = TransactionType.purchase
            name, reg, ceo, addr = inv.supplier_name, inv.supplier_reg, inv.supplier_ceo, inv.supplier_addr
        else:
            row.status, row.message = "error", "공급자/공급받는자 어느 쪽도 우리 회사 사업자번호와 다릅니다."
            plan.append(row)
            continue

        row.counterparty_name = name
        row.counterparty_reg_no = format_reg_no(reg) if reg else ""
        row.counterparty_ceo, row.counterparty_addr = ceo, addr
        names = inv.item_names
        row.item_name = (names[0] + (f" 외 {len(names) - 1}건" if len(names) > 1 else "")) if names else "세금계산서"
        row.item_name = row.item_name[:200]

        if inv.write_date is None:
            row.status, row.message = "error", "작성일자를 읽지 못했습니다."
        elif inv.supply is None:
            row.status, row.message = "error", "공급가액을 읽지 못했습니다."
        elif inv.approval_no in existing_numbers:
            row.status, row.message = "duplicate", "이미 입력된 승인번호입니다."
        else:
            existing = clients_by_reg.get(reg) if reg else None
            if existing is not None:
                row.client_action, row.client_id = "existing", existing.id
            elif is_valid_reg_no(reg) and name:
                row.client_action = "create"
            elif reg and not is_valid_reg_no(reg):
                row.message = "사업자번호 형식이 올바르지 않아 거래처로 연결하지 않고 상호만 기록합니다."
        plan.append(row)

    # create 자리 표시를 되돌려 두 번째 이후 행은 같은 신규 거래처를 따르도록 표시
    seen_create: set[str] = set()
    for row in plan:
        if row.client_action == "create":
            key = digits_only(row.counterparty_reg_no)
            if key in seen_create:
                row.client_action = "create_same"  # 앞선 행에서 등록되는 거래처를 같이 사용
            seen_create.add(key)
    return plan


def _fmt_num(value: float) -> str:
    return f"{value:,.0f}" if float(value).is_integer() else f"{value:,.2f}".rstrip("0").rstrip(".")


def _document_items(row: PlanRow) -> list[ProjectDocumentItem]:
    """홈택스 품목을 세금계산서 문서 품목으로 바꾼다. 문서 품목은 수량이 정수라서, 홈택스 금액이 어긋나지 않도록
    수량 1, 단가 = 품목 공급가액으로 넣고 원래 수량/단가는 비고에 남긴다."""
    built: list[tuple[str, int, str | None]] = []
    for it in row.items:
        if not it.name and it.supply is None:
            continue
        note = None
        if it.quantity and it.unit_price:
            note = f"수량 {_fmt_num(it.quantity)} × 단가 {_fmt_num(it.unit_price)}"
        built.append(((it.name or "품목")[:300], it.supply or 0, note))

    if len(built) > MAX_ITEMS:
        rest = built[MAX_ITEMS - 1 :]
        built = built[: MAX_ITEMS - 1] + [(f"외 {len(rest)}건", sum(r[1] for r in rest), None)]
    # 품목 합계가 세금계산서 공급가액과 다르면 한 줄로 합쳐 금액이 틀어지지 않게 한다.
    if not built or sum(b[1] for b in built) != row.supply:
        built = [((row.item_name or "세금계산서")[:300], row.supply, None)]
    return [
        ProjectDocumentItem(content=name, quantity=1, unit_price=amount, note=note, sort_order=idx)
        for idx, (name, amount, note) in enumerate(built)
    ]


def apply_plan(db: Session, plan: list[PlanRow], user_id: int, create_clients: bool = True, create_documents: bool = True) -> dict:
    created_clients = 0
    created_documents = 0
    imported = 0
    new_client_ids: dict[str, int] = {}

    for row in plan:
        if row.status != "new" or row.type is None or row.transaction_date is None:
            continue

        client_id = row.client_id
        if row.client_action in ("create", "create_same") and create_clients:
            key = digits_only(row.counterparty_reg_no)
            if key in new_client_ids:
                client_id = new_client_ids[key]
            else:
                client = Client(
                    name=row.counterparty_name[:200],
                    biz_reg_no=row.counterparty_reg_no,
                    ceo_name=row.counterparty_ceo[:100] or None,
                    address=row.counterparty_addr[:300] or None,
                    created_by=user_id,
                )
                db.add(client)
                db.flush()
                new_client_ids[key] = client.id
                client_id = client.id
                created_clients += 1
                logger.debug(f"[HometaxImport] 새 거래처 자동 등록: {client.name} ({client.biz_reg_no})")

        tx = Transaction(
                type=row.type,
                transaction_date=row.transaction_date,
                client_id=client_id,
                counterparty=row.counterparty_name[:200] or None,
                item_name=row.item_name,
                supply_amount=row.supply,
                vat_amount=row.vat,
                total_amount=row.supply + row.vat,
                tax_invoice_no=row.approval_no,
                memo="홈택스 가져오기",
                created_by=user_id,
            )
        db.add(tx)
        db.flush()
        imported += 1

        if create_documents:
            snapshot = {
                k: v
                for k, v in {
                    "reg_no": row.counterparty_reg_no,
                    "name": row.counterparty_name,
                    "ceo_name": row.counterparty_ceo,
                    "address": row.counterparty_addr,
                }.items()
                if v
            }
            doc = ProjectDocument(
                project_id=None,
                project_other_name="홈택스 가져오기",
                doc_type=ProjectDocType.tax_invoice,
                issue_date=row.transaction_date,
                currency="KRW",
                purpose_type=row.purpose,
                client_name=(row.counterparty_name or "-")[:200],
                other_client_id=client_id,
                counterparty_info=snapshot or None,
                direction=row.type.value,
                approval_no=row.approval_no,
                # 이미 국세청에 발행된 세금계산서를 기록하는 것이므로 결재 없이 승인된 상태로 둔다.
                status=ProjectDocumentStatus.approved,
                is_final_decision=True,
                reviewed_at=datetime.now(timezone.utc),
                ledger_transaction_id=tx.id,
                created_by=user_id,
            )
            doc.items = _document_items(row)
            db.add(doc)
            created_documents += 1

    db.commit()
    skipped = sum(1 for r in plan if r.status == "duplicate")
    errors = sum(1 for r in plan if r.status == "error")
    logger.debug(f"[HometaxImport] 적용 완료: imported={imported}, duplicates={skipped}, errors={errors}, new_clients={created_clients}, documents={created_documents}")
    return {
        "imported": imported,
        "skipped_duplicates": skipped,
        "errors": errors,
        "created_clients": created_clients,
        "created_documents": created_documents,
    }
