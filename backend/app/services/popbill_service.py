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


def build_taxinvoice(doc: ProjectDocument, client: Client) -> Taxinvoice:
    biz_no = _digits_only(client.biz_reg_no)
    if len(biz_no) != 10:
        raise PopbillConfigError(
            f"거래처 '{client.name}'의 사업자번호가 올바르지 않습니다. 거래처관리에서 10자리 사업자번호를 등록해주세요."
        )
    if not client.ceo_name:
        raise PopbillConfigError(f"거래처 '{client.name}'의 대표자명이 없습니다. 거래처관리에서 등록해주세요.")

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
        invoicerEmail="",
        invoiceeEmail1="",
        invoicerSMSSendYN=False,
        invoiceeSMSSendYN=False,
    )
    invoice.detailList = detail_list
    return invoice


def issue_tax_invoice(doc: ProjectDocument, client: Client) -> dict:
    """세금계산서를 팝빌로 정발행한다. 성공 시 (mgt_key, nts_confirm_num)을 반환한다."""
    sdk = get_service()
    invoice = build_taxinvoice(doc, client)
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
