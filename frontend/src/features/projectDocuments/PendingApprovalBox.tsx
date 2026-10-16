import { Check, X } from "lucide-react";
import { formatDocAmount, itemsTotal } from "./documentHelpers";
import { PROJECT_DOC_TYPE_LABELS, type ProjectDocument } from "./types";

interface PendingApprovalBoxProps {
  /** 내가 결재할 차례인 문서 */
  docs: ProjectDocument[];
  busyId: number | null;
  onApprove: (doc: ProjectDocument) => void;
  onReject: (doc: ProjectDocument) => void;
}

// 문서관리 상단의 "내 결재함 - 승인 대기 중인 문서" 상자.
export function PendingApprovalBox({ docs, busyId, onApprove, onReject }: PendingApprovalBoxProps) {
  return (
    <div className="bg-surface border border-tile-blue-fg/30 rounded-2xl p-5 mb-6">
      <h2 className="text-sm font-semibold mb-3">내 결재함 - 승인 대기 중인 문서 ({docs.length}건)</h2>
      <div className="space-y-2">
        {docs.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                {doc.delete_requested && <span className="text-danger">[삭제 요청] </span>}
                {PROJECT_DOC_TYPE_LABELS[doc.doc_type]} · {doc.project_name}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {doc.client_name} · {doc.issue_date}
                {doc.doc_no && ` · No. ${doc.doc_no}`} · 합계 {formatDocAmount(doc, itemsTotal(doc))}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onApprove(doc)}
                disabled={busyId === doc.id}
                className="flex items-center gap-1 text-xs text-success border border-success/30 rounded-lg px-3 py-1.5 hover:bg-success/10 disabled:opacity-50"
              >
                <Check size={14} />
                승인
              </button>
              <button
                onClick={() => onReject(doc)}
                disabled={busyId === doc.id}
                className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-danger/10 disabled:opacity-50"
              >
                <X size={14} />
                반려
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
