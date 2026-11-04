import { apiGet } from "../../lib/api";
import { hasMenuPermission, type CurrentUser } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { DOC_TYPE_LABELS, type DocumentRecord } from "../documents/types";
import { formatDocAmount, itemsSummary, itemsTotal } from "../projectDocuments/documentHelpers";
import { PROJECT_DOC_TYPE_LABELS, type ProjectDocument } from "../projectDocuments/types";
import { formatProposalAmount } from "../proposals/purchaseFlow";
import type { Proposal } from "../proposals/types";

/** 서류 찾기의 종류 칩. "all" 말고는 서류 한 건이 속한 종류와 같다. */
export type DocFilter = "all" | "quotation" | "statement" | "tax_invoice" | "purchase_order" | "proposal" | "certificate";

export const DOC_FILTERS: { key: DocFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "quotation", label: "견적서" },
  { key: "statement", label: "거래명세서" },
  { key: "tax_invoice", label: "세금계산서" },
  { key: "purchase_order", label: "발주서" },
  { key: "proposal", label: "품의서" },
  { key: "certificate", label: "증명서" },
];

export type DocSearchStatus = "draft" | "pending" | "approved" | "rejected" | "withdrawn";

/** 서류 찾기 한 줄. 모바일에서는 읽기 전용이라 찾고 보기에 필요한 값만 둔다. */
export interface DocSearchItem {
  key: string;
  filter: Exclude<DocFilter, "all">;
  kindLabel: string;
  title: string;
  subtitle: string;
  /** YYYY-MM-DD (정렬·표시용) */
  date: string;
  amount: string | null;
  status: DocSearchStatus;
  /** PDF를 열 수 있으면 그 경로 (결재 승인 전에는 null) */
  pdfPath: string | null;
  /** 검색 대상 글자 (소문자) */
  searchText: string;
}

export interface DocSearchSources {
  projectDocs: ProjectDocument[];
  proposals: Proposal[];
  certificates: DocumentRecord[];
}

/** 서류 세 가지 목록을 하나로 합쳐 최신순으로 정리한다. 세금계산서는 세금계산서 권한이 있는 사람에게만 보인다. */
export function buildDocSearchItems(user: CurrentUser | null, src: DocSearchSources): DocSearchItem[] {
  const canSeeTax = hasMenuPermission(user, "tax_invoice");
  const items: DocSearchItem[] = [];

  for (const d of src.projectDocs) {
    if (d.doc_type === "tax_invoice" && !canSeeTax) continue;
    const kindLabel = d.doc_type === "tax_invoice" && d.kind_label ? d.kind_label : PROJECT_DOC_TYPE_LABELS[d.doc_type];
    const amount = formatDocAmount(d, itemsTotal(d));
    const subtitle = `${d.client_name}${d.doc_no ? ` · ${d.doc_no}` : ""}`;
    items.push({
      key: `project-${d.id}`, filter: d.doc_type, kindLabel, title: d.project_name, subtitle, date: d.issue_date, amount,
      status: d.status,
      pdfPath: d.status === "approved" && d.has_pdf ? `/api/project-documents/${d.id}/pdf` : null,
      searchText: `${kindLabel} ${d.project_name} ${subtitle} ${d.creator_name} ${itemsSummary(d)} ${d.manager_name ?? ""}`.toLowerCase(),
    });
  }

  for (const p of src.proposals) {
    const kindLabel = p.kind ? `품의서(${p.kind})` : "품의서";
    const subtitle = `${p.creator_name} · ${p.doc_no}`;
    items.push({
      key: `proposal-${p.id}`, filter: "proposal", kindLabel, title: p.title, subtitle, date: p.issue_date, amount: formatProposalAmount(p),
      status: p.status,
      pdfPath: p.status === "approved" && p.has_pdf ? `/api/proposals/${p.id}/pdf` : null,
      searchText: `${kindLabel} ${p.title} ${subtitle} ${p.vendor_name ?? ""} ${p.topic}`.toLowerCase(),
    });
  }

  for (const c of src.certificates) {
    const kindLabel = DOC_TYPE_LABELS[c.doc_type];
    const subtitle = `${c.user_name}${c.purpose ? ` · ${c.purpose}` : ""}`;
    items.push({
      key: `certificate-${c.id}`, filter: "certificate", kindLabel, title: kindLabel, subtitle, date: c.issued_at.slice(0, 10), amount: null,
      status: c.status,
      pdfPath: c.status === "approved" && c.has_pdf ? `/api/documents/${c.id}/download` : null,
      searchText: `${kindLabel} ${subtitle}`.toLowerCase(),
    });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
}

/** 종류 칩과 검색어로 걸러 낸다. 검색어는 공백으로 나눈 단어가 모두 들어 있어야 한다. */
export function filterDocSearchItems(items: DocSearchItem[], filter: DocFilter, query: string): DocSearchItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((it) => (filter === "all" || it.filter === filter) && words.every((w) => it.searchText.includes(w)));
}

async function safeGet<T>(path: string): Promise<T[]> {
  try {
    return await apiGet<T[]>(path);
  } catch (err) {
    logError("MobileDocuments", `조회 실패: ${path}`, err);
    return [];
  }
}

export async function loadDocSearchItems(user: CurrentUser | null): Promise<DocSearchItem[]> {
  logDebug("MobileDocuments", "서류 목록 조회 시작");
  const [projectDocs, proposals, certificates] = await Promise.all([
    safeGet<ProjectDocument>("/api/project-documents"),
    safeGet<Proposal>("/api/proposals"),
    safeGet<DocumentRecord>("/api/documents/me"),
  ]);
  const items = buildDocSearchItems(user, { projectDocs, proposals, certificates });
  logDebug("MobileDocuments", `서류 ${items.length}건`);
  return items;
}
