import { Check, Download, ExternalLink, Paperclip, Pencil, Printer, Link as LinkIcon, Trash2, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApprovalStampTable } from "../../components/approval/ApprovalStampTable";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiPost, apiUpload, downloadFile } from "../../lib/api";
import { isAdminRole } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { ApproverPickerModal } from "../projectDocuments/ApproverPickerModal";
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
  onDeleted,
}: {
  proposal: Proposal;
  isBusy: boolean;
  onClose: () => void;
  onApprove: (proposal: Proposal) => void;
  onReject: (proposal: Proposal) => void;
  onDownload: (proposal: Proposal) => void;
  onPrint: (proposal: Proposal) => void;
  onAttachmentsChanged: (proposal: Proposal) => void;
  onDeleted: () => void; // 삭제되었거나 삭제 결재를 요청한 뒤 목록을 새로 고친다
}) {
  const { user } = useAuth();
  const currentStep = proposal.steps.find((s) => s.step_order === proposal.current_step);
  const canDecide = proposal.status === "pending" && currentStep?.approver_id === user?.id;
  const canManageAttachments = proposal.created_by === user?.id;
  const navigate = useNavigate();
  const isMine = proposal.created_by === user?.id;
  // 반려/승인된 품의서는 작성자가 수정할 수 있다 (승인된 품의서는 수정 후 결재를 다시 받아야 한다).
  const canEdit = isMine && proposal.status !== "pending" && !proposal.delete_requested;
  // 승인된 품의서는 삭제 결재를 거쳐야 삭제된다. 그 외에는 작성자가 바로 삭제할 수 있다.
  const canDelete = !proposal.delete_requested && (isMine || (proposal.status === "approved" && isAdminRole(user?.role)));
  const [showDeletePicker, setShowDeletePicker] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleEdit() {
    logDebug("Proposals", `수정 진입: id=${proposal.id}, status=${proposal.status}`);
    navigate(`/proposals/new?edit=${proposal.id}`);
  }

  async function handleDeleteClick() {
    setActionError(null);
    if (proposal.status === "approved") {
      if (!window.confirm("승인된 품의서는 결재를 거쳐야 삭제됩니다. 삭제 결재를 요청할까요?")) return;
      setShowDeletePicker(true);
      return;
    }
    if (!window.confirm("이 품의서를 삭제할까요?")) return;
    setDeleteBusy(true);
    try {
      await apiDelete(`/api/proposals/${proposal.id}`);
      logDebug("Proposals", `삭제 완료: id=${proposal.id}`);
      onDeleted();
    } catch (err) {
      logError("Proposals", "삭제 실패", err);
      setActionError(err instanceof ApiError ? err.message : "삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleRequestDelete(endTitle: string | null, approverIds: number[], isFinalDecision: boolean) {
    setDeleteBusy(true);
    try {
      await apiPost(`/api/proposals/${proposal.id}/request-delete`, {
        end_title: endTitle,
        approver_ids: approverIds,
        is_final_decision: isFinalDecision,
      });
      logDebug("Proposals", `삭제 결재 요청 성공: id=${proposal.id}`);
      setShowDeletePicker(false);
      window.alert(isFinalDecision ? "삭제되었습니다." : "삭제 결재 요청이 완료되었습니다. 최종 승인되면 삭제됩니다.");
      onDeleted();
    } catch (err) {
      logError("Proposals", "삭제 결재 요청 실패", err);
      setShowDeletePicker(false);
      setActionError(err instanceof ApiError ? err.message : "삭제 결재 요청 중 오류가 발생했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  }

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
          <span className={`text-xs px-2 py-1 font-medium ${PROPOSAL_STATUS_STYLES[proposal.status]}`}>
            {PROPOSAL_STATUS_LABELS[proposal.status]}
          </span>
          {proposal.status === "pending" && currentStep && (
            <span className="text-xs text-text-muted">
              현재 결재 대기: {PROPOSAL_TITLE_LABELS[currentStep.title]} {currentStep.approver_name}
            </span>
          )}
        </div>

        {proposal.is_final_decision && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-tile-blue px-4 py-3 text-sm text-tile-blue-fg">
            전결로 즉시 승인된 문서입니다. (결재자: {proposal.creator_name})
          </div>
        )}

        <ApprovalStampTable steps={proposal.steps} currentStep={proposal.current_step} docStatus={proposal.status} finalDecision={proposal.is_final_decision} />

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
        {proposal.delete_requested && (
          <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2 mb-4">
            이 품의서는 삭제 결재가 진행 중입니다. 최종 승인되면 삭제되고, 반려되면 기존 승인 상태로 유지됩니다.
          </p>
        )}
        {actionError && <p className="text-xs text-danger mb-3">{actionError}</p>}

        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <button
              onClick={handleEdit}
              disabled={isBusy || deleteBusy}
              title={proposal.status === "approved" ? "수정하면 결재를 다시 받아야 합니다." : "수정한 뒤 결재를 다시 요청합니다."}
              className="flex items-center gap-1 text-xs text-text-muted border border-border rounded-lg px-3 py-1.5 hover:bg-bg disabled:opacity-50"
            >
              <Pencil size={14} />
              수정{proposal.status === "approved" ? " (재결재 필요)" : " 후 재요청"}
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDeleteClick}
              disabled={isBusy || deleteBusy}
              title={proposal.status === "approved" ? "삭제 결재 요청" : "삭제"}
              className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-danger/10 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {proposal.status === "approved" ? "삭제 결재 요청" : "삭제"}
            </button>
          )}
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
      {showDeletePicker && (
        <ApproverPickerModal
          isSubmitting={deleteBusy}
          onConfirm={(endTitle, approverIds, isFinal) => handleRequestDelete(endTitle, approverIds, isFinal)}
          onCancel={() => setShowDeletePicker(false)}
        />
      )}
    </div>
  );
}
