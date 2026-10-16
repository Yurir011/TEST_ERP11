import { describe, expect, it } from "vitest";
import { computeTaxInvoiceStats, filterTaxInvoices, itemsSummary, itemsTotal, type TaxInvoiceFilters } from "./documentHelpers";
import type { ProjectDocument } from "./types";

const doc = (over: Partial<ProjectDocument> = {}): ProjectDocument =>
  ({
    id: 1,
    doc_type: "tax_invoice",
    issue_date: "2026-10-05",
    currency: "KRW",
    status: "approved",
    purpose_type: "청구",
    direction: "sales",
    is_paper: false,
    popbill_issued: false,
    project_name: "프로젝트A",
    client_name: "한빛통신",
    manager_name: "김담당",
    doc_no: "Q-001",
    items: [{ content: "품목1", quantity: 2, unit_price: 50_000 }],
    ...over,
  }) as ProjectDocument;

const NOW = new Date(2026, 9, 16); // 2026-10-16
const noFilter: TaxInvoiceFilters = {
  paper: "all",
  direction: "all",
  purpose: "all",
  status: "all",
  issued: "all",
  month: "all",
  dateFrom: "",
  dateTo: "",
  query: "",
};

describe("itemsTotal / itemsSummary", () => {
  it("품목별 반올림 후 합산", () => {
    const d = doc({ items: [{ content: "a", quantity: 3, unit_price: 454_545.5 }, { content: "b", quantity: 1, unit_price: 1_000 }] as ProjectDocument["items"] });
    expect(itemsTotal(d)).toBe(1_363_637 + 1_000);
  });

  it("첫 품목 + 외 N건", () => {
    expect(itemsSummary(doc())).toBe("품목1");
    expect(itemsSummary(doc({ items: [{ content: "a" }, { content: "b" }, { content: "c" }] as ProjectDocument["items"] }))).toBe("a 외 2건");
    expect(itemsSummary(doc({ items: [] }))).toBe("-");
  });
});

describe("computeTaxInvoiceStats", () => {
  it("이번 달·전월 금액과 전월 대비 증감, 미발행 건수 (원화만 합산)", () => {
    const docs = [
      doc({ id: 1, issue_date: "2026-10-05", items: [{ content: "x", quantity: 1, unit_price: 200_000 }] as ProjectDocument["items"], popbill_issued: true }),
      doc({ id: 2, issue_date: "2026-09-20", items: [{ content: "x", quantity: 1, unit_price: 100_000 }] as ProjectDocument["items"] }),
      doc({ id: 3, issue_date: "2026-10-07", currency: "USD", items: [{ content: "x", quantity: 1, unit_price: 999 }] as ProjectDocument["items"] }),
    ];
    const s = computeTaxInvoiceStats(docs, NOW);
    expect(s.thisMonthAmount).toBe(200_000); // 외화 문서는 제외
    expect(s.lastMonthAmount).toBe(100_000);
    expect(s.momChangePct).toBe(100); // 10만 → 20만
    expect(s.totalCount).toBe(3);
    expect(s.issuedCount).toBe(1);
    expect(s.notIssuedCount).toBe(2);
  });

  it("전월 금액이 0이면 이번 달이 있을 때 +100%, 없으면 0%", () => {
    expect(computeTaxInvoiceStats([doc({ issue_date: "2026-10-05" })], NOW).momChangePct).toBe(100);
    expect(computeTaxInvoiceStats([doc({ issue_date: "2026-01-05" })], NOW).momChangePct).toBe(0);
  });

  it("1월에는 전월을 작년 12월로 계산한다", () => {
    const jan = new Date(2026, 0, 15);
    const s = computeTaxInvoiceStats([doc({ issue_date: "2025-12-20" })], jan);
    expect(s.lastMonthCount).toBe(1);
  });
});

describe("filterTaxInvoices", () => {
  const docs = [
    doc({ id: 1, issue_date: "2026-10-05", direction: "sales", is_paper: false, popbill_issued: true }),
    doc({ id: 2, issue_date: "2026-09-10", direction: "purchase", is_paper: true, popbill_issued: false, client_name: "대성전자" }),
    doc({ id: 3, issue_date: "2026-10-12", direction: undefined, purpose_type: "영수", popbill_issued: false }),
  ];
  const ids = (list: ProjectDocument[]) => list.map((d) => d.id);

  it("조건이 없으면 전부", () => {
    expect(ids(filterTaxInvoices(docs, noFilter, NOW))).toEqual([1, 2, 3]);
  });

  it("매출/매입 구분: 방향이 없으면 매출로 본다", () => {
    expect(ids(filterTaxInvoices(docs, { ...noFilter, direction: "sales" }, NOW))).toEqual([1, 3]);
    expect(ids(filterTaxInvoices(docs, { ...noFilter, direction: "purchase" }, NOW))).toEqual([2]);
  });

  it("종이/전자, 발행 여부, 목적", () => {
    expect(ids(filterTaxInvoices(docs, { ...noFilter, paper: "paper" }, NOW))).toEqual([2]);
    expect(ids(filterTaxInvoices(docs, { ...noFilter, paper: "electronic" }, NOW))).toEqual([1, 3]);
    expect(ids(filterTaxInvoices(docs, { ...noFilter, issued: "not_issued" }, NOW))).toEqual([2, 3]);
    expect(ids(filterTaxInvoices(docs, { ...noFilter, purpose: "영수" }, NOW))).toEqual([3]);
  });

  it("이번 달/지난달/직접 입력 기간", () => {
    expect(ids(filterTaxInvoices(docs, { ...noFilter, month: "this" }, NOW))).toEqual([1, 3]);
    expect(ids(filterTaxInvoices(docs, { ...noFilter, month: "last" }, NOW))).toEqual([2]);
    expect(ids(filterTaxInvoices(docs, { ...noFilter, dateFrom: "2026-10-06", dateTo: "2026-10-31" }, NOW))).toEqual([3]);
  });

  it("자유 검색은 프로젝트·거래처·담당자·문서번호를 대소문자 구분 없이 찾는다", () => {
    expect(ids(filterTaxInvoices(docs, { ...noFilter, query: "대성" }, NOW))).toEqual([2]);
    expect(ids(filterTaxInvoices(docs, { ...noFilter, query: "  q-001 " }, NOW))).toEqual([1, 2, 3]);
    expect(ids(filterTaxInvoices(docs, { ...noFilter, query: "없는검색어" }, NOW))).toEqual([]);
  });
});
