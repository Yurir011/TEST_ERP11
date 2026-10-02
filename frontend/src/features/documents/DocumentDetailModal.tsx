import { Check, Download, X } from "lucide-react";
import { ApprovalStampTable } from "../../components/approval/ApprovalStampTable";
import { useAuth } from "../../context/AuthContext";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatDate } from "../../lib/format";
import { DOC_TYPE_LABELS, type DocumentRecord } from "./types";

const TITLE_LABELS = { dept_head: "부서장", team_lead: "팀장", ceo: "대표" } as const;

export function DocumentDetailModal({
  doc,
  isBusy,
  isDownloading,
  onClose,
  onApprove,
  onReject,
  onDownload,
}: {
  doc: DocumentRecord;
  isBusy: boolean;
  isDownloading: boolean;
  onClose: () => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDownload: (doc: DocumentRecord) => void;
}) {
  const { user } = useAuth();
  const currentStep = doc.steps.find((s) => s.step_order === doc.current_step);
  const canDecide = doc.status === "pending" && currentStep?.approver_id === user?.id;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">{DOC_TYPE_LABELS[doc.doc_type]} 발급 신청</h3>
            <p className="text-xs text-text-muted mt-1">신청일 {formatDate(doc.issued_at)}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <StatusBadge status={doc.status} />
          {doc.status === "pending" && currentStep && (
            <span className="text-xs text-text-muted">
              현재 결재 대기: {TITLE_LABELS[currentStep.title]} {currentStep.approver_name}
            </span>
          )}
        </div>

        <ApprovalStampTable steps={doc.steps} currentStep={doc.current_step} docStatus={doc.status} />

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <p className="text-xs text-text-muted mb-0.5">신청자</p>
            <p className="font-medium">{doc.user_name}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-0.5">서류 종류</p>
            <p className="font-medium">{DOC_TYPE_LABELS[doc.doc_type]}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-text-muted mb-0.5">용도</p>
            <p className="font-medium">{doc.purpose ?? "용도 미기재"}</p>
          </div>
          {doc.reviewed_at && (
            <div>
              <p className="text-xs text-text-muted mb-0.5">{doc.status === "rejected" ? "반려일" : "승인일"}</p>
              <p className="font-medium">{formatDate(doc.reviewed_at)}</p>
            </div>
          )}
        </div>

        {doc.status === "rejected" && doc.reject_reason && (
          <p className="text-sm text-danger bg-red-50 rounded-xl px-4 py-3 mb-4">반려 사유: {doc.reject_reason}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          {doc.has_pdf && doc.status === "approved" && (
            <button
              onClick={() => onDownload(doc)}
              disabled={isDownloading}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-2 disabled:opacity-50"
            >
              <Download size={14} />
              {isDownloading ? "다운로드 중..." : "PDF 다운로드"}
            </button>
          )}
          {canDecide && (
            <>
              <button
                onClick={() => onReject(doc.id)}
                disabled={isBusy}
                className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-2 hover:bg-red-50 disabled:opacity-50"
              >
                <X size={14} />
                반려
              </button>
              <button
                onClick={() => onApprove(doc.id)}
                disabled={isBusy}
                className="flex items-center gap-1 text-xs text-success border border-success/30 rounded-lg px-3 py-2 hover:bg-tile-green disabled:opacity-50"
              >
                <Check size={14} />
                승인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
