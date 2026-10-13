"""팝빌 전자세금계산서 연동. 결재 승인된 세금계산서(ProjectDocument)를 실제로 국세청에 발행한다.
PopBill/README.md 에 있는 로컬 테스트 도구(PopBill/app.py)에서 검증한 연동 방식을 그대로 따른다."""
from decimal import ROUND_HALF_UP, Decimal

from popbill import PopbillException, Taxinvoice, TaxinvoiceDetail, TaxinvoiceService

from app.config import settings
from app.logging_config import get_logger
from app.models.client import Client
from app.models.project_document import ProjectDocument, calc_amount, format_price

logger = get_logger("PopbillService")


class PopbillConfigError(Exception):
    """인증정보 미입력 등 연동 준비가 안 된 경우."""


def _digits_only(value: str | None) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


def get_service() -> TaxinvoiceService:
    required = {
        "POPBILL_LINK_ID": settings.popbill_link_id,
        "POPBILL_SECRET_KEY": settings.popbill_secret_key,
        "POPBILL_CORP_NUM": settings.popbill_corp_num,
        "POPBILL_USER_ID": settings.popbill_user_id,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        raise PopbillConfigError(f"팝빌 연동 정보가 설정되지 않았습니다: {', '.join(missing)}")

    sdk = TaxinvoiceService(settings.popbill_link_id, settings.popbill_secret_key)
    sdk.IsTest = settings.popbill_is_test
    sdk.IPRestrictOnOff = True
    sdk.UseStaticIP = False
    sdk.UseLocalTimeYN = True
    return sdk


def _mgt_key(doc: ProjectDocument) -> str:
    return f"BENCH{doc.id:010d}"


def _round_tax(supply: int) -> int:
    return int((Decimal(supply) / 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


# 세금계산서 발행 시 공급받는자(거래처)에 반드시 있어야 하는 정보: (필드명, 화면 라벨)
REQUIRED_CLIENT_FIELDS: list[tuple[str, str]] = [
    ("biz_reg_no", "사업자등록번호"),
    ("ceo_name", "대표자명"),
    ("address", "사업장 주소"),
    ("biz_type", "업태"),
    ("biz_class", "종목"),
    ("email", "이메일"),
]


def client_email(client: Client) -> str:
    """거래처 대표 이메일. 거래처 이메일이 없으면 담당자 이메일 중 첫 번째를 쓴다."""
    if client.email:
        return client.email
    return next((c.email for c in client.contacts if c.email), "")


def client_field_values(client: Client) -> dict[str, str]:
    return {
        "biz_reg_no": client.biz_reg_no or "",
        "ceo_name": client.ceo_name or "",
        "address": client.address or "",
        "biz_type": client.biz_type or "",
        "biz_class": client.biz_class or "",
        "email": client_email(client),
    }


def find_missing_client_fields(client: Client) -> list[str]:
    """발행에 필요한데 비어 있거나 형식이 틀린 거래처 필드명 목록."""
    values = client_field_values(client)
    missing = [key for key, _ in REQUIRED_CLIENT_FIELDS if not values[key].strip()]
    if "biz_reg_no" not in missing and len(_digits_only(values["biz_reg_no"])) != 10:
        missing.append("biz_reg_no")
    if "email" not in missing and "@" not in values["email"]:
        missing.append("email")
    return missing


def supplier_email(user_email: str | None) -> str:
    return settings.company_email or user_email or ""


def build_taxinvoice(doc: ProjectDocument, client: Client, issuer_email: str | None = None) -> Taxinvoice:
    missing = find_missing_client_fields(client)
    if missing:
        labels = dict(REQUIRED_CLIENT_FIELDS)
        raise PopbillConfigError(f"거래처 '{client.name}'의 필수 정보가 부족합니다: {', '.join(labels[k] for k in missing)}")
    biz_no = _digits_only(client.biz_reg_no)

    written = doc.issue_date.strftime("%Y%m%d")

    supply_total = 0
    detail_list: list[TaxinvoiceDetail] = []
    for idx, item in enumerate(doc.items, start=1):
        supply = calc_amount(item.quantity, item.unit_price)
        tax = _round_tax(supply)
        supply_total += supply
        detail_list.append(
            TaxinvoiceDetail(
                serialNum=idx,
                purchaseDT=written,
                itemName=item.content,
                qty=str(item.quantity),
                unitCost=format_price(item.unit_price).replace(",", ""),
                supplyCost=str(supply),
                tax=str(tax),
            )
        )
    tax_total = _round_tax(supply_total)

    invoice = Taxinvoice(
        issueType="정발행",
        taxType="과세",
        chargeDirection="정과금",
        purposeType=doc.purpose_type,
        writeDate=written,
        invoicerMgtKey=_mgt_key(doc),
        invoicerCorpNum=settings.popbill_corp_num,
        invoicerCorpName=settings.company_name,
        invoicerCEOName=settings.company_ceo_name,
        invoicerAddr=settings.company_address,
        invoicerBizType=settings.company_biz_type,
        invoicerBizClass=settings.company_biz_class,
        invoiceeType="사업자",
        invoiceeCorpNum=biz_no,
        invoiceeCorpName=client.name,
        invoiceeCEOName=client.ceo_name,
        invoiceeAddr=client.address or "",
        invoiceeBizType=client.biz_type or "",
        invoiceeBizClass=client.biz_class or "",
        supplyCostTotal=str(supply_total),
        taxTotal=str(tax_total),
        totalAmount=str(supply_total + tax_total),
        invoicerEmail=supplier_email(issuer_email),
        invoiceeEmail1=client_email(client),
        invoicerSMSSendYN=False,
        invoiceeSMSSendYN=False,
    )
    invoice.detailList = detail_list
    return invoice


def issue_tax_invoice(doc: ProjectDocument, client: Client, issuer_email: str | None = None) -> dict:
    """세금계산서를 팝빌로 정발행한다. 성공 시 (mgt_key, nts_confirm_num)을 반환한다."""
    sdk = get_service()
    invoice = build_taxinvoice(doc, client, issuer_email)
    logger.debug(f"[PopbillService] 세금계산서 발행 시도: doc_id={doc.id}, mgt_key={invoice.invoicerMgtKey}")
    try:
        result = sdk.registIssue(
            settings.popbill_corp_num,
            invoice,
            False,
            False,
            "",
            "BENCH ERP 자동 발행",
            "",
            settings.popbill_user_id,
        )
    except PopbillException as err:
        logger.debug(f"[PopbillService] 세금계산서 발행 실패: doc_id={doc.id}, code={err.code}, message={err.message}")
        raise
    nts_confirm_num = getattr(result, "ntsConfirmNum", "") or ""
    logger.debug(
        f"[PopbillService] 세금계산서 발행 완료: doc_id={doc.id}, mgt_key={invoice.invoicerMgtKey}, "
        f"nts_confirm_num={nts_confirm_num}"
    )
    return {"mgt_key": invoice.invoicerMgtKey, "nts_confirm_num": nts_confirm_num}


def get_view_url(doc: ProjectDocument) -> str:
    sdk = get_service()
    return sdk.getViewURL(settings.popbill_corp_num, "SELL", doc.popbill_mgt_key, settings.popbill_user_id)


def get_pdf_url(doc: ProjectDocument) -> str:
    sdk = get_service()
    return sdk.getPDFURL(settings.popbill_corp_num, "SELL", doc.popbill_mgt_key, settings.popbill_user_id)


def get_balance() -> Decimal:
    sdk = get_service()
    return sdk.getBalance(settings.popbill_corp_num)
