import { logDebug } from "./logger";

// 세금계산서 파일을 어디서든 올리면 "세금계산서 목록에도 등록할까요?" 알림을 띄운다.
// 알림과 등록 팝업은 InvoiceRegisterHost 가 그린다 (App 에서 한 번만 둔다). 켜져 있지 않으면 아무 일도 하지 않는다.

export interface InvoiceOffer {
  /** 방금 올린 파일들 (사진이면 인식해서 입력란을 미리 채우고 문서 사진으로 저장한다) */
  files: File[];
  /** 파일을 올린 구매 품의서 (연결해 승인될 때 같은 매입이 두 번 기록되지 않게 한다) */
  proposalId?: number | null;
  /** 파일을 올린 매입매출 거래 (연결해 승인될 때 같은 거래가 갱신된다) */
  transactionId?: number | null;
}

let listener: ((offer: InvoiceOffer) => void) | null = null;

export function registerInvoiceOffer(fn: ((offer: InvoiceOffer) => void) | null): void {
  listener = fn;
}

/** 세금계산서 파일을 올린 직후에 부른다. 올린 파일이 없으면 무시한다. */
export function offerInvoiceRegistration(offer: InvoiceOffer): void {
  if (!listener || offer.files.length === 0) return;
  logDebug("InvoiceOffer", `세금계산서 등록 제안: files=${offer.files.length}, proposal=${offer.proposalId ?? "-"}, tx=${offer.transactionId ?? "-"}`);
  listener(offer);
}

/** 사진 인식·문서 사진 저장이 되는 이미지 형식인가 (서버가 jpg·png·webp 만 받는다) */
export const isInvoiceImage = (f: Pick<File, "type">) => ["image/jpeg", "image/png", "image/webp"].includes(f.type);
