import type { TaxInvoicePurpose } from "./types";

/** 세금계산서를 작성(또는 반려 후 재요청)하는 시점에 실제 입금(청구)/지급(영수) 여부를 확인창으로 물어본다.
 * 여기서 받은 답은 결재가 바로 나든(전결/자기결재) 나중에 다른 결재자가 승인하든, 실제 승인되는
 * 순간 그대로 입출금관리에 반영된다(미수/미지급이면 외상매출금/외상매입금으로 기록). */
export function askTaxInvoicePaymentReceived(purposeType: TaxInvoicePurpose, clientName: string): boolean {
  const isBilling = purposeType === "청구";
  const question = isBilling
    ? `"${clientName}"로부터 입금을 확인하셨습니까?\n\n아니오를 선택하면 미수로 간주해 결재 승인 시 입출금관리에 외상매출금으로 기록됩니다.`
    : `"${clientName}"에 대금을 지급하셨습니까?\n\n아니오를 선택하면 미지급으로 간주해 결재 승인 시 입출금관리에 외상매입금으로 기록됩니다.`;
  return window.confirm(question);
}
