import { filterAndSortRows, type ListRowValues, type ListViewOptions } from "../../lib/listView";
import type { Proposal } from "./types";

export { DEFAULT_PERIOD_MONTHS, PERIOD_MONTHS, SORT_LABELS, periodStart, type SortDirection, type SortKey } from "../../lib/listView";

/** 품의서 한 건에서 정렬·검색에 쓰는 값을 뽑는다 (업체명·품의명·프로젝트·문서번호·기안자·종류가 검색 대상) */
export function proposalValues(p: Proposal): ListRowValues {
  return {
    date: p.issue_date,
    vendor: p.vendor_name ?? "",
    amount: p.amount ?? null,
    status: p.status,
    searchText: [p.vendor_name, p.title, p.project_name, p.doc_no, p.creator_name, p.kind].filter(Boolean).join(" "),
    id: p.id,
  };
}

export const filterAndSortProposals = (list: Proposal[], opts: ListViewOptions) => filterAndSortRows(list, proposalValues, opts);
