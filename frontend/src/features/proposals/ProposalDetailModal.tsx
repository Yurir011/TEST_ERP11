import { Check, Download, ExternalLink, Paperclip, Printer, Link as LinkIcon, Trash2, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiDelete, apiPost, apiUpload, downloadFile } from "../../lib/api";
import { logError } from "../../lib/logger";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_STYLES, PROPOSAL_TITLE_LABELS, type Proposal, type ProposalAttachment } from "./types";

function docTitle(p: Proposal): string {
  return p.kind ? `${p.kind}품의서` : "품의서";
}

export function ProposalDetailModal({
  proposal,
  isBusy,
  onClose,
  onApprove,
  onReject,
  onDownload,
  onPrint,
  onAttachmentsChanged,
}: {
  proposal: Proposal;
  isBusy: boolean;
  onClose: () => void;
  onApprove: (proposal: Proposal) => void;
  onReject: (proposal: Proposal) => void;
  onDownload: (proposal: Proposal) => void;
  onPrint: (proposal: Proposal) => void;
  onAttachmentsChanged: (proposal: Proposal) => void;
}) {
  const { user } = useAuth();
  const currentStep = proposal.steps.find((s) => s.step_order === proposal.current_step);
  const canDecide = proposal.status === "pending" && currentStep?.approver_id === user?.id;
  const canManageAttachments = proposal.created_by === user?.id;

  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  async function handleAddFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAttachmentError(null);
    setAttachmentBusy(true);
    try {
      const updated = await apiUpload<Proposal>(`/api/proposals/${proposal.id}/attachments/file`, file);
      onAttachmentsChanged(updated);
    } catch (err) {
      logError("Proposals", "첨부파일 업로드 실패", err);
      setAttachmentError(err instanceof ApiError ? err.message : "첨부파일 업로드 중 오류가 발생했습니다.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function handleAddLink() {
    if (!linkUrl.trim()) return;
    setAttachmentError(null);
    setAttachmentBusy(true);
    try {
      const updated = await apiPost<Proposal>(`/api/proposals/${proposal.id}/attachments/link`, {
        url: linkUrl.trim(),
        label: linkLabel.trim() || undefined,
      });
      onAttachmentsChanged(updated);
      setLinkUrl("");
      setLinkLabel("");
    } catch (err) {
      logError("Proposals", "첨부링크 추가 실패", err);
      setAttachmentError(err instanceof ApiError ? err.message : "첨부링크 추가 중 오류가 발생했습니다.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function handleDeleteAttachment(attachment: ProposalAttachment) {
    setAttachmentError(null);
    setAttachmentBusy(true);
    try {
      const updated = await apiDelete<Proposal>(`/api/proposals/${proposal.id}/attachments/${attachment.id}`);
      onAttachmentsChanged(updated);
    } catch (err) {
      logError("Proposals", "첨부 삭제 실패", err);
      setAttachmentError(err instanceof ApiError ? err.message : "첨부 삭제 중 오류가 발생했습니다.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  function handleOpenAttachment(attachment: ProposalAttachment) {
    if (attachment.kind === "link" && attachment.url) {
      window.open(attachment.url, "_blank");
    } else {
      downloadFile(`/api/proposals/${proposal.id}/attachments/${attachment.id}/file`, attachment.label).catch((err) =>
        logError("Proposals", "첨부파일 다운로드 실패", err)
      );
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">
              {docTitle(proposal)} · {proposal.title}
            </h3>
            <p className="text-xs text-text-muted mt-1">
              No. {proposal.doc_no} · {proposal.issue_date}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${PROPOSAL_STATUS_STYLES[proposal.status]}`}>
            {PROPOSAL_STATUS_LABELS[proposal.status]}
          </span>
          {proposal.status === "pending" && currentStep && (
            <span className="text-xs text-text-muted">
              현재 결재 대기: {PROPOSAL_TITLE_LABELS[currentStep.title]} {currentStep.approver_name}
            </span>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          {proposal.steps.map((step) => (
            <div
              key={step.step_order}
              className={`flex-1 rounded-xl border p-3 text-center ${
                step.status === "approved"
                  ? "border-success/40 bg-tile-green"
                  : step.step_order === proposal.current_step && proposal.status === "pending"
                    ? "border-primary/40 bg-tile-blue"
                    : "border-dashed border-border bg-bg"
              }`}
            >
              <p className="text-[11px] font-semibold text-text-muted">{PROPOSAL_TITLE_LABELS[step.title]}</p>
              {step.status === "approved" ? (
                <>
                  <p className="text-sm font-medium mt-1">{step.approver_name}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">결재완료</p>
                </>
              ) : (
                <p className="text-xs text-text-muted mt-2">
                  {step.status === "rejected" ? "반려" : "결재대기"}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <p className="text-xs text-text-muted mb-0.5">기안자</p>
            <p className="font-medium">{proposal.creator_name}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-0.5">기안부서</p>
            <p className="font-medium">{proposal.department_name}</p>
          </div>
        </div>

        <div className="bg-bg rounded-xl p-4 text-sm mb-4">
          <p>1. 아래와 같이 {proposal.topic}을 진행하고자 하오니 검토하여 승인해 주십시오.</p>
          <p className="mt-3 whitespace-pre-line text-text-muted">{proposal.content}</p>
        </div>

        <div className="mb-4">
          <p className="text-xs text-text-muted mb-1.5">첨부파일 · 링크</p>
          {proposal.attachments.length === 0 && <p className="text-xs text-text-muted">첨부된 파일/링크가 없습니다.</p>}
          {proposal.attachments.length > 0 && (
            <ul className="space-y-1.5">
              {proposal.attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2 text-sm">
                  <button
                    type="button"
                    onClick={() => handleOpenAttachment(a)}
                    className="flex items-center gap-2 min-w-0 text-left hover:text-primary"
                  >
                    {a.kind === "file" ? (
                      <Paperclip size={14} className="text-text-muted shrink-0" />
                    ) : (
                      <LinkIcon size={14} className="text-text-muted shrink-0" />
                    )}
                    <span className="truncate">{a.label}</span>
                    {a.kind === "link" && <ExternalLink size={11} className="text-text-muted shrink-0" />}
                  </button>
                  {canManageAttachments && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(a)}
                      disabled={attachmentBusy}
                      className="text-text-muted hover:text-danger shrink-0 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManageAttachments && (
            <div className="mt-3 space-y-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-primary cursor-pointer hover:opacity-80">
                <Paperclip size={13} />
                파일 추가
                <input type="file" onChange={handleAddFile} disabled={attachmentBusy} className="hidden" />
              </label>
              <div className="flex items-center gap-2">
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs outline-none focus:border-primary bg-bg"
                />
                <input
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder="설명 (선택)"
                  className="w-28 rounded-lg border border-border px-3 py-1.5 text-xs outline-none focus:border-primary bg-bg"
                />
                <button
                  type="button"
                  onClick={handleAddLink}
                  disabled={attachmentBusy}
                  className="text-xs text-text-muted border border-border rounded-lg px-3 py-1.5 hover:bg-bg disabled:opacity-50 shrink-0"
                >
                  추가
                </button>
              </div>
              {attachmentError && <p className="text-xs text-danger">{attachmentError}</p>}
            </div>
          )}
        </div>

        {proposal.status === "rejected" && proposal.reject_reason && (
          <p className="text-xs text-danger mb-4">반려 사유: {proposal.reject_reason}</p>
        )}

        <div className="flex items-center gap-2">
          {canDecide && (
            <>
              <button
                onClick={() => onApprove(proposal)}
                disabled={isBusy}
                className="flex items-center gap-1 text-xs text-success border border-success/30 rounded-lg px-3 py-1.5 hover:bg-success/10 disabled:opacity-50"
              >
                <Check size={14} />
                승인
              </button>
              <button
                onClick={() => onReject(proposal)}
                disabled={isBusy}
                className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-danger/10 disabled:opacity-50"
              >
                <X size={14} />
                반려
              </button>
            </>
          )}
          {proposal.has_pdf && (
            <>
              <button
                onClick={() => onDownload(proposal)}
                disabled={isBusy}
                className="flex items-center gap-1 text-xs text-text-muted border border-border rounded-lg px-3 py-1.5 hover:bg-bg disabled:opacity-50"
              >
                <Download size={14} />
                저장
              </button>
              <button
                onClick={() => onPrint(proposal)}
                className="flex items-center gap-1 text-xs text-text-muted border border-border rounded-lg px-3 py-1.5 hover:bg-bg"
              >
                <Printer size={14} />
                출력
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
