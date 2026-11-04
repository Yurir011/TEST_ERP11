import { describe, expect, it } from "vitest";
import type { CurrentUser } from "../../lib/auth";
import type { DocumentRecord } from "../documents/types";
import type { ProjectDocument } from "../projectDocuments/types";
import type { Proposal } from "../proposals/types";
import { buildDocSearchItems, filterDocSearchItems } from "./documentSearch";

const user = (over: Partial<CurrentUser> = {}): CurrentUser =>
  ({ id: 1, role: "employee", menu_permissions: [], ...over }) as unknown as CurrentUser;

const doc = (over: Partial<ProjectDocument>): ProjectDocument =>
  ({
    id: 1, doc_type: "quotation", project_name: "안테나 개발", client_name: "한결통신", doc_no: "Q-001", currency: "KRW", issue_date: "2026-11-03",
    items: [{ content: "안테나 모듈", quantity: 10, unit_price: 1000 }], status: "approved", has_pdf: true, creator_name: "김도윤", manager_name: null,
    kind_label: null, ...over,
  }) as unknown as ProjectDocument;

const proposal: Proposal = {
  id: 2, doc_no: "P-001", kind: "구매", title: "스펙트럼 분석기 구매", topic: "계측기", vendor_name: "우진RF", amount: 4800000, currency: "KRW",
  issue_date: "2026-11-04", status: "pending", has_pdf: true, creator_name: "박서연",
} as unknown as Proposal;

const cert = { id: 3, doc_type: "employment", purpose: "은행 제출", user_name: "이도현", status: "approved", has_pdf: true, issued_at: "2026-10-28T09:00:00Z" } as unknown as DocumentRecord;

const sources = {
  projectDocs: [doc({}), doc({ id: 4, doc_type: "tax_invoice", client_name: "대성전자", issue_date: "2026-10-30" })],
  proposals: [proposal],
  certificates: [cert],
};

describe("buildDocSearchItems", () => {
  it("세금계산서는 권한이 있는 사람에게만 보인다", () => {
    expect(buildDocSearchItems(user(), sources).map((i) => i.kindLabel)).not.toContain("세금계산서");
    expect(buildDocSearchItems(user({ menu_permissions: ["tax_invoice"] }), sources).map((i) => i.kindLabel)).toContain("세금계산서");
  });

  it("최신 날짜 순으로 합치고, PDF는 승인된 서류만 열 수 있다", () => {
    const items = buildDocSearchItems(user(), sources);
    expect(items.map((i) => i.key)).toEqual(["proposal-2", "project-1", "certificate-3"]);
    expect(items.find((i) => i.key === "proposal-2")?.pdfPath).toBeNull(); // 결재 대기 중
    expect(items.find((i) => i.key === "project-1")?.pdfPath).toBe("/api/project-documents/1/pdf");
    expect(items.find((i) => i.key === "certificate-3")?.pdfPath).toBe("/api/documents/3/download");
  });

  it("금액을 같이 보여 준다", () => {
    const items = buildDocSearchItems(user(), sources);
    expect(items.find((i) => i.key === "project-1")?.amount).toBe("₩10,000");
    expect(items.find((i) => i.key === "proposal-2")?.amount).toBe("₩4,800,000");
    expect(items.find((i) => i.key === "certificate-3")?.amount).toBeNull();
  });
});

describe("filterDocSearchItems", () => {
  const items = buildDocSearchItems(user({ menu_permissions: ["tax_invoice"] }), sources);

  it("종류 칩으로 거른다", () => {
    expect(filterDocSearchItems(items, "proposal", "").map((i) => i.key)).toEqual(["proposal-2"]);
    expect(filterDocSearchItems(items, "all", "")).toHaveLength(4);
  });

  it("검색어는 공백으로 나눈 단어가 모두 들어 있어야 한다 (제목·거래처·작성자·품목)", () => {
    expect(filterDocSearchItems(items, "all", "한결 q-001").map((i) => i.key)).toEqual(["project-1"]);
    expect(filterDocSearchItems(items, "all", "박서연").map((i) => i.key)).toEqual(["proposal-2"]);
    expect(filterDocSearchItems(items, "all", "안테나 모듈").map((i) => i.key)).toEqual(["project-1", "project-4"]);
    expect(filterDocSearchItems(items, "all", "없는말")).toEqual([]);
  });
});
