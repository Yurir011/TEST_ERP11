import { describe, expect, it } from "vitest";
import type { Proposal } from "../proposals/types";
import { filterAndSortDocRows } from "./docListView";
import type { DocListRow } from "./documentHelpers";
import type { ProjectDocument } from "./types";

const TODAY = new Date(2026, 9, 22);
const opts = (o: Partial<Parameters<typeof filterAndSortDocRows>[1]> = {}) => ({ months: 1, query: "", sortKey: "date" as const, direction: "desc" as const, today: TODAY, ...o });

const doc = (id: number, issue_date: string, client_name: string, project_name: string, price: number, content = "부품"): DocListRow => ({
  kind: "doc",
  doc: { id, issue_date, client_name, project_name, doc_type: "quotation", doc_no: `Q-${id}`, items: [{ id: 1, content, quantity: 1, unit_price: price, note: null }], currency: "KRW" } as unknown as ProjectDocument,
});
const proposal = (id: number, issue_date: string, title: string, vendor_name: string | null, amount: number | null): DocListRow => ({
  kind: "proposal",
  proposal: { id, issue_date, title, vendor_name, amount, doc_no: `P-${id}`, creator_name: "박소장" } as unknown as Proposal,
});

const rows = [
  doc(1, "2026-10-20", "가나상사", "5G 중계기", 300000, "안테나"),
  proposal(2, "2026-10-15", "출장비 지급", null, null),
  doc(3, "2026-10-01", "다라전자", "서버 증설", 900000),
  proposal(4, "2026-08-01", "공구 구매", "마바공업", 80000),
];
const ids = (r: DocListRow[]) => r.map((x) => (x.kind === "doc" ? `d${x.doc.id}` : `p${x.proposal.id}`));

describe("문서관리 목록의 기간·검색·정렬", () => {
  it("기본은 최근 1개월 안, 최근 날짜 먼저 (문서와 품의서가 섞여 정렬된다)", () => {
    expect(ids(filterAndSortDocRows(rows, opts()))).toEqual(["d1", "p2", "d3"]);
    expect(ids(filterAndSortDocRows(rows, opts({ months: 3 })))).toEqual(["d1", "p2", "d3", "p4"]);
  });

  it("업체명·프로젝트·품목·문서번호·품의명으로 찾고, 여러 단어는 모두 들어 있어야 한다", () => {
    expect(ids(filterAndSortDocRows(rows, opts({ months: 12, query: "가나" })))).toEqual(["d1"]);
    expect(ids(filterAndSortDocRows(rows, opts({ months: 12, query: "중계기" })))).toEqual(["d1"]);
    expect(ids(filterAndSortDocRows(rows, opts({ months: 12, query: "안테나" })))).toEqual(["d1"]);
    expect(ids(filterAndSortDocRows(rows, opts({ months: 12, query: "q-3" })))).toEqual(["d3"]);
    expect(ids(filterAndSortDocRows(rows, opts({ months: 12, query: "출장" })))).toEqual(["p2"]);
    expect(ids(filterAndSortDocRows(rows, opts({ months: 12, query: "서버 다라" })))).toEqual(["d3"]);
    expect(ids(filterAndSortDocRows(rows, opts({ months: 12, query: "서버 가나" })))).toEqual([]);
  });

  it("업체명순·금액순 정렬 (업체명이나 금액이 없으면 맨 뒤)", () => {
    expect(ids(filterAndSortDocRows(rows, opts({ months: 12, sortKey: "vendor", direction: "asc" })))).toEqual(["d1", "d3", "p4", "p2"]);
    expect(ids(filterAndSortDocRows(rows, opts({ months: 12, sortKey: "amount", direction: "desc" })))).toEqual(["d3", "d1", "p4", "p2"]);
  });
});

describe("상태로 거르기", () => {
  it("결재 상태가 같은 문서·품의서만 보인다", () => {
    const withStatus: DocListRow[] = [
      { kind: "doc", doc: { ...(rows[0] as { doc: object }).doc, status: "pending" } as unknown as ProjectDocument },
      { kind: "proposal", proposal: { ...(rows[1] as { proposal: object }).proposal, status: "approved" } as unknown as Proposal },
    ];
    expect(ids(filterAndSortDocRows(withStatus, opts({ status: "pending" })))).toEqual(["d1"]);
    expect(ids(filterAndSortDocRows(withStatus, opts({ status: "approved" })))).toEqual(["p2"]);
    expect(ids(filterAndSortDocRows(withStatus, opts({ status: "" })))).toEqual(["d1", "p2"]);
  });
});
