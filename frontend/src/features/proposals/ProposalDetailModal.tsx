import { Check, Download, ExternalLink, Paperclip, Pencil, Printer, Link as LinkIcon, Trash2, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApprovalNote, ApprovalStamps } from "../../components/approval/ApprovalStamps";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiPost, apiUpload, downloadFile } from "../../lib/api";
import { openAttachment } from "../../lib/openAttachment";
import { isAdminRole } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { ApproverPickerModal } from "../projectDocuments/ApproverPickerModal";
import { objectParticle } from "../../lib/korean";
import { formatProposalAmount } from "./purchaseFlow";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_STYLES, type Proposal, type ProposalAttachment } from "./types";
import { useDialog } from "../../components/ui/dialog/useDialog";

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
  const { confirm, notify } = useDialog();
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
      if (!(await confirm("승인된 품의서는 결재를 거쳐야 삭제됩니다. 삭제 결재를 요청할까요?", { okLabel: "삭제 결재 요청" }))) return;
      setShowDeletePicker(true);
      return;
    }
    if (!(await confirm("이 품의서를 삭제할까요?", { okLabel: "삭제", danger: true }))) return;
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
      notify(isFinalDecision ? "삭제되었습니다." : "삭제 결재 요청이 완료되었습니다. 최종 승인되면 삭제됩니다.");
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
      openAttachment(`/api/proposals/${proposal.id}/attachments/${attachment.id}/file`, attachment.label).catch((err) => {
        logError("Proposals", "첨부파일 열기 실패", err);
        setAttachmentError(err instanceof ApiError ? err.message : "파일을 열지 못했습니다.");
      });
    }
  }

  /** 열지 않고 항상 내려받아 저장한다 */
  function handleSaveAttachment(attachment: ProposalAttachment) {
    downloadFile(`/api/proposals/${proposal.id}/attachments/${attachment.id}/file`, attachment.label).catch((err) => {
      logError("Proposals", "첨부파일 저장 실패", err);
      setAttachmentError(err instanceof ApiError ? err.message : "파일을 저장하지 못했습니다.");
    });
  }

  const historyInput = {
    creatorName: proposal.creator_name,
    createdAt: proposal.created_at,
    summary: proposal.title,
    steps: proposal.steps,
    currentStep: proposal.current_step,
    status: proposal.status,
    finalDecision: proposal.is_final_decision,
    rejectReason: proposal.reject_reason,
    deleteRequested: proposal.delete_requested,
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold">
              {docTitle(proposal)} · {proposal.title}
            </h3>
            <p className="text-xs text-text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                No. {proposal.doc_no} · {proposal.issue_date}
              </span>
              <span className={`text-xs px-2 py-0.5 font-bold ${PROPOSAL_STATUS_STYLES[proposal.status]}`}>
                {PROPOSAL_STATUS_LABELS[proposal.status]}
              </span>
            </p>
          </div>
          <ApprovalStamps {...historyInput} />
          <button onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="mt-3 empty:hidden">
          <ApprovalNote {...historyInput} />
        </div>

        {/* 기안자·부서·프로젝트·거래처·금액을 한 줄로 흘려 보여 준다 */}
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {[
            ["기안자", proposal.creator_name],
            ["기안부서", proposal.department_name],
            ...(proposal.vendor_name || formatProposalAmount(proposal) || proposal.project_name
              ? [
                  ["프로젝트", proposal.project_name || "일반"],
                  ["거래처", proposal.vendor_name || "-"],
                  ["금액", formatProposalAmount(proposal) ?? "-"],
                ]
              : []),
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dt className="text-xs text-text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="bg-bg rounded-xl px-4 py-3 text-sm leading-relaxed mt-4">
          <p>
            1. 아래와 같이 {proposal.topic}
            {objectParticle(proposal.topic)} 진행하고자 하오니 검토하여 승인해 주십시오.
          </p>
          <p className="mt-2 whitespace-pre-line text-text-muted">{proposal.content}</p>
        </div>

        <hr className="border-border my-4" />

        <div className="mb-4">
          <p className="text-sm font-bold mb-2">첨부파일 · 링크</p>
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
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {a.kind === "file" && (
                      <button
                        type="button"
                        onClick={() => handleSaveAttachment(a)}
                        aria-label={`${a.label} 저장`}
                        title="내 PC에 저장"
                        className="text-text-muted hover:text-primary"
                      >
                        <Download size={14} />
                      </button>
                    )}
                    {canManageAttachments && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(a)}
                        disabled={attachmentBusy}
                        aria-label={`${a.label} 삭제`}
                        title="삭제"
                        className="text-text-muted hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
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
