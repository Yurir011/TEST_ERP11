import { filterAndSortRows, type ListRowValues, type ListViewOptions } from "../../lib/listView";
import { proposalValues } from "../proposals/proposalList";
import { itemsTotal, type DocListRow } from "./documentHelpers";
import { PROJECT_DOC_TYPE_LABELS } from "./types";

/** 문서관리 목록의 한 줄(문서 또는 품의서)에서 정렬·검색에 쓰는 값을 뽑는다 */
export function docRowValues(row: DocListRow): ListRowValues {
  if (row.kind === "proposal") return proposalValues(row.proposal);
  const d = row.doc;
  return {
    date: d.issue_date,
    vendor: d.client_name ?? "",
    amount: itemsTotal(d),
    status: d.status,
    // 거래처·프로젝트·문서번호·품목 이름·담당자·종류(견적서 등)로 찾을 수 있다
    searchText: [d.client_name, d.project_name, d.doc_no, d.approval_no, d.manager_name, d.creator_name, d.remark, PROJECT_DOC_TYPE_LABELS[d.doc_type], ...d.items.map((i) => i.content)]
      .filter(Boolean)
      .join(" "),
    id: d.id,
  };
}

export const filterAndSortDocRows = (rows: DocListRow[], opts: ListViewOptions) => filterAndSortRows(rows, docRowValues, opts);
