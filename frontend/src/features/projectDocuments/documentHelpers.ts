import { lineAmount } from "../../lib/money";
import type { Proposal } from "../proposals/types";
import { DOC_CURRENCY_SYMBOLS, PROJECT_DOC_TYPE_LABELS, type ProjectDocument, type ProjectDocumentStatus, type TaxInvoicePurpose } from "./types";

// 문서관리 화면의 순수 계산·표시 함수 (화면 상태와 분리).

/** 목록 한 줄: 문서 또는 품의서 (전체 탭에서는 둘이 섞여 나온다) */
export type DocListRow = { kind: "doc"; doc: ProjectDocument } | { kind: "proposal"; proposal: Proposal };

/** 결재가 끝나 PDF 가 만들어진 문서만 저장·출력·발송할 수 있다. */
export function isDocApproved(doc: ProjectDocument): boolean {
  return doc.status === "approved" && doc.has_pdf;
}

/** 목록 요약: 첫 품목 + "외 N건" */
export function itemsSummary(doc: ProjectDocument): string {
  if (doc.items.length === 0) return "-";
  const first = doc.items[0].content;
  return doc.items.length > 1 ? `${first} 외 ${doc.items.length - 1}건` : first;
}

/** 품목 금액 합계(공급가액). 품목별로 원 단위 사사오입한 값을 더한다 (서버와 같은 계산). */
export function itemsTotal(doc: ProjectDocument): number {
  return doc.items.reduce((sum, it) => sum + lineAmount(it.quantity, it.unit_price), 0);
}

export function formatDocAmount(doc: ProjectDocument, amount: number): string {
  return `${DOC_CURRENCY_SYMBOLS[doc.currency]}${amount.toLocaleString()}`;
}

export function pdfFilename(doc: ProjectDocument): string {
  return `${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}_${doc.issue_date}.pdf`;
}

export function excelFilename(doc: ProjectDocument): string {
  return `${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}_${doc.issue_date}.xlsx`;
}

/** "YYYY-MM-DD" → "YYYY-MM" */
export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * "세금계산서 통계" 집계: 이번 달·전월 발행 금액, 전월 대비 증감, 팝빌 미발행 건수.
 * 금액은 KRW 문서만 합산한다 (외화는 드문 경우라 섞으면 왜곡됨).
 */
export function computeTaxInvoiceStats(docs: ProjectDocument[], now: Date = new Date()) {
  const krwDocs = docs.filter((d) => d.currency === "KRW");
  const thisMonth = monthKeyOf(now);

  const thisMonthDocs = krwDocs.filter((d) => monthKey(d.issue_date) === thisMonth);
  const thisMonthAmount = thisMonthDocs.reduce((sum, d) => sum + itemsTotal(d), 0);

  const issuedCount = docs.filter((d) => d.popbill_issued).length;
  const notIssuedCount = docs.length - issuedCount;

  const lastMonthKey = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthDocs = krwDocs.filter((d) => monthKey(d.issue_date) === lastMonthKey);
  const lastMonthAmount = lastMonthDocs.reduce((sum, d) => sum + itemsTotal(d), 0);
  const momChangePct =
    lastMonthAmount > 0 ? ((thisMonthAmount - lastMonthAmount) / lastMonthAmount) * 100 : thisMonthAmount > 0 ? 100 : 0;

  return {
    totalCount: docs.length,
    thisMonthAmount,
    thisMonthCount: thisMonthDocs.length,
    issuedCount,
    notIssuedCount,
    lastMonthAmount,
    lastMonthCount: lastMonthDocs.length,
    momChangePct,
  };
}

/** 세금계산서 목록의 조회 조건 */
export interface TaxInvoiceFilters {
  paper: "all" | "electronic" | "paper";
  direction: "all" | "sales" | "purchase";
  purpose: "all" | TaxInvoicePurpose;
  status: "all" | ProjectDocumentStatus;
  issued: "all" | "issued" | "not_issued";
  month: "all" | "this" | "last";
  dateFrom: string;
  dateTo: string;
  /** 자유 검색어 (프로젝트·거래처·담당자·문서번호) */
  query: string;
}

/** 세금계산서 목록에 조회 조건을 적용한다. 세금계산서가 아닌 화면에서는 호출하지 않는다. */
export function filterTaxInvoices(docs: ProjectDocument[], f: TaxInvoiceFilters, now: Date = new Date()): ProjectDocument[] {
  const q = f.query.trim().toLowerCase();
  const thisMonthKey = monthKeyOf(now);
  const lastMonthKey = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  return docs.filter((doc) => {
    if (f.paper === "paper" && !doc.is_paper) return false;
    if (f.paper === "electronic" && doc.is_paper) return false;
    if (f.direction !== "all" && (doc.direction === "purchase" ? "purchase" : "sales") !== f.direction) return false;
    if (f.purpose !== "all" && doc.purpose_type !== f.purpose) return false;
    if (f.status !== "all" && doc.status !== f.status) return false;
    if (f.issued === "issued" && !doc.popbill_issued) return false;
    if (f.issued === "not_issued" && doc.popbill_issued) return false;
    if (f.month === "this" && monthKey(doc.issue_date) !== thisMonthKey) return false;
    if (f.month === "last" && monthKey(doc.issue_date) !== lastMonthKey) return false;
    if (f.dateFrom && doc.issue_date < f.dateFrom) return false;
    if (f.dateTo && doc.issue_date > f.dateTo) return false;
    if (q && !`${doc.project_name} ${doc.client_name} ${doc.manager_name ?? ""} ${doc.doc_no ?? ""}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}
