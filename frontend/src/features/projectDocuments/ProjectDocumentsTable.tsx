import { Download, Mail, Printer, Sheet, Trash2 } from "lucide-react";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_STYLES, type Proposal } from "../proposals/types";
import { formatDocAmount, isDocApproved, itemsSummary, itemsTotal, type DocListRow } from "./documentHelpers";
import {
  PROJECT_DOC_STATUS_LABELS,
  PROJECT_DOC_STATUS_STYLES,
  PROJECT_DOC_TYPE_LABELS,
  type ProjectDocType,
  type ProjectDocument,
} from "./types";

interface ProjectDocumentsTableProps {
  rows: DocListRow[];
  lockedDocType?: ProjectDocType;
  /** 로그인한 사용자 id (반려된 내 문서의 "재요청" 버튼 표시용) */
  userId: number | undefined;
  busyId: number | null;
  onOpenDoc: (doc: ProjectDocument) => void;
  onOpenProposal: (proposal: Proposal) => void;
  onResubmit: (doc: ProjectDocument) => void;
  onDownload: (doc: ProjectDocument) => void;
  onDownloadExcel: (doc: ProjectDocument) => void;
  onPrint: (doc: ProjectDocument) => void;
  onSend: (doc: ProjectDocument) => void;
  onDelete: (doc: ProjectDocument) => void;
  onProposalDownload: (proposal: Proposal) => void;
  onProposalPrint: (proposal: Proposal) => void;
}

// 문서관리 목록 표. "전체" 탭에서는 문서와 품의서가 한 표에 섞여 나온다.
export function ProjectDocumentsTable({
  rows,
  lockedDocType,
  userId,
  busyId,
  onOpenDoc,
  onOpenProposal,
  onResubmit,
  onDownload,
  onDownloadExcel,
  onPrint,
  onSend,
  onDelete,
  onProposalDownload,
  onProposalPrint,
}: ProjectDocumentsTableProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
      {/* 표 스타일: 연한 세로선 + 줄무늬 + 톤다운 파랑 머리글 (첫 열 앞만 제외). 짧은 열은 내용 폭에 맞춘다. */}
      <table className="w-full text-sm [&_th:not(:first-child)]:border-l [&_th:not(:first-child)]:border-primary/[0.12] [&_td:not(:first-child)]:border-l [&_td:not(:first-child)]:border-text/[0.07]">
        <thead>
          <tr className="text-center bg-primary/[0.06] border-b border-border">
            {lockedDocType === "tax_invoice" && <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">구분</th>}
            {lockedDocType !== "tax_invoice" && (
              <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">구분</th>
            )}
            <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">상태</th>
            {lockedDocType === "tax_invoice" && (
              <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">팝빌</th>
            )}
            <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">날짜</th>
            <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center">프로젝트</th>
            <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center">거래처명</th>
            <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">담당자</th>
            <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center">내용</th>
            <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">합계</th>
            <th className="w-px whitespace-nowrap"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === "proposal") {
              const p = row.proposal;
              const pApproved = p.status === "approved" && p.has_pdf;
              return (
                <tr
                  key={`p${p.id}`}
                  onClick={() => onOpenProposal(p)}
                  className="cursor-pointer hover:bg-primary/10 even:bg-text/[0.025] transition-colors"
                >
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.orange}`}>{p.kind ? `${p.kind}품의서` : "품의서"}</span>
                  </td>
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    <span
                      className={`text-xs px-2 py-1 font-medium ${PROPOSAL_STATUS_STYLES[p.status]}`}
                      title={p.status === "rejected" ? p.reject_reason ?? undefined : undefined}
                    >
                      {PROPOSAL_STATUS_LABELS[p.status]}
                    </span>
                    {p.is_final_decision && p.status === "approved" && (
                      <span className={`ml-1.5 text-xs px-2 py-1 font-medium ${SOFT_BADGE.purple}`}>전결</span>
                    )}
                    {p.delete_requested && <span className={`ml-1.5 text-xs px-2 py-1 font-medium ${SOFT_BADGE.red}`}>삭제 결재 중</span>}
                  </td>
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    {p.issue_date}
                    <p className="text-xs text-text-muted mt-0.5">No. {p.doc_no}</p>
                  </td>
                  <td className="py-2.5 px-4 text-center text-text-muted">-</td>
                  <td className="py-2.5 px-4 text-center text-text-muted">-</td>
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">{p.creator_name}</td>
                  <td className="py-2.5 px-4 text-center">{p.title}</td>
                  <td className="py-2.5 px-4 text-right text-text-muted whitespace-nowrap">-</td>
                  <td className="py-2.5 px-2 w-px whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onProposalDownload(p)}
                        disabled={!pApproved || busyId === p.id}
                        title={pApproved ? "저장 (PDF)" : "결재 승인 후 이용 가능합니다."}
                        className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => onProposalPrint(p)}
                        disabled={!pApproved}
                        title={pApproved ? "출력" : "결재 승인 후 이용 가능합니다."}
                        className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Printer size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }
            const doc = row.doc;
            const approved = isDocApproved(doc);
            const disabledTitle = "결재 승인 후 이용 가능합니다.";
            return (
              <tr
                key={doc.id}
                onClick={() => onOpenDoc(doc)}
                className="cursor-pointer hover:bg-primary/10 even:bg-text/[0.025] transition-colors"
              >
                {lockedDocType === "tax_invoice" && (
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    {/* 종이 세금계산서는 항상 매입이므로 "매입" 배지 없이 "종이"만 표시한다. */}
                    {doc.is_paper ? (
                      <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.gray}`}>종이</span>
                    ) : (
                      <span
                        className={`text-xs px-2 py-1 font-medium ${
                          doc.direction === "purchase" ? SOFT_BADGE.orange : SOFT_BADGE.purple
                        }`}
                      >
                        {doc.direction === "purchase" ? "매입" : "매출"}
                      </span>
                    )}
                  </td>
                )}
                {lockedDocType !== "tax_invoice" && (
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.blue}`}>
                      {PROJECT_DOC_TYPE_LABELS[doc.doc_type]}
                    </span>
                  </td>
                )}
                <td className="py-2.5 px-4 text-center whitespace-nowrap">
                  <span
                    className={`text-xs px-2 py-1 font-medium ${PROJECT_DOC_STATUS_STYLES[doc.status]}`}
                    title={doc.status === "rejected" ? doc.reject_reason ?? undefined : undefined}
                  >
                    {PROJECT_DOC_STATUS_LABELS[doc.status]}
                  </span>
                  {doc.is_final_decision && doc.status === "approved" && (
                    <span className={`ml-1.5 text-xs px-2 py-1 font-medium ${SOFT_BADGE.purple}`}>전결</span>
                  )}
                  {doc.delete_requested && (
                    <span className={`ml-1.5 text-xs px-2 py-1 font-medium ${SOFT_BADGE.red}`}>삭제 결재 중</span>
                  )}
                </td>
                {lockedDocType === "tax_invoice" && (
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    {/* 팝빌 발행 대상은 매출 세금계산서뿐이다. 발행됨 / 승인되어 발행 대기 / 그 외(-) 로 나눈다. */}
                    {doc.popbill_issued ? (
                      <span
                        className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.green}`}
                        title={`국세청 승인번호 ${doc.popbill_nts_confirm_num}`}
                      >
                        발행
                      </span>
                    ) : doc.direction !== "purchase" && doc.status === "approved" && !doc.delete_requested ? (
                      <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.orange}`} title="승인되었으나 아직 팝빌로 발행하지 않았습니다.">
                        대기
                      </span>
                    ) : (
                      <span className="text-text-muted/50">-</span>
                    )}
                  </td>
                )}
                <td className="py-2.5 px-4 text-center whitespace-nowrap">
                  {doc.issue_date}
                  {doc.doc_no && <p className="text-xs text-text-muted mt-0.5">No. {doc.doc_no}</p>}
                </td>
                <td className="py-2.5 px-4 text-center">{doc.project_name}</td>
                <td className="py-2.5 px-4 text-center">{doc.client_name}</td>
                <td className="py-2.5 px-4 text-center whitespace-nowrap">{doc.manager_name ?? "-"}</td>
                <td className="py-2.5 px-4 text-center">{itemsSummary(doc)}</td>
                <td className="py-2.5 px-4 text-right font-medium whitespace-nowrap">{formatDocAmount(doc, itemsTotal(doc))}</td>
                <td className="py-2.5 px-2 w-px whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {doc.status === "rejected" && doc.created_by === userId && (
                      <button
                        onClick={() => onResubmit(doc)}
                        className="text-xs text-primary hover:opacity-80 border border-primary/30 rounded-lg px-2 py-1 whitespace-nowrap shrink-0"
                      >
                        재요청
                      </button>
                    )}
                    <button
                      onClick={() => onDownload(doc)}
                      disabled={!approved || busyId === doc.id}
                      title={approved ? "저장 (PDF)" : disabledTitle}
                      className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => onDownloadExcel(doc)}
                      disabled={!doc.has_excel || busyId === doc.id}
                      title={doc.has_excel ? "저장 (엑셀)" : disabledTitle}
                      className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Sheet size={14} />
                    </button>
                    <button
                      onClick={() => onPrint(doc)}
                      disabled={!approved}
                      title={approved ? "출력" : disabledTitle}
                      className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Printer size={14} />
                    </button>
                    <button
                      onClick={() => onSend(doc)}
                      disabled={!approved || busyId === doc.id}
                      title={approved ? "이메일 발송" : disabledTitle}
                      className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Mail size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(doc)}
                      disabled={doc.delete_requested}
                      title={doc.delete_requested ? "삭제 결재가 진행 중입니다." : doc.status === "approved" ? "삭제 결재 요청" : "삭제"}
                      className="p-1.5 text-text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
