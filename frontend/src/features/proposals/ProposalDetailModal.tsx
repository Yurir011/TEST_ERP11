import { Check, Download, ExternalLink, Paperclip, Pencil, Printer, Link as LinkIcon, Trash2, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApprovalNote, ApprovalStampBox } from "../../components/approval/ApprovalStamps";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiPost, apiUpload, downloadFile } from "../../lib/api";
import { openAttachment } from "../../lib/openAttachment";
import { isAdminRole } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { ApproverPickerModal } from "../projectDocuments/ApproverPickerModal";
import { objectParticle } from "../../lib/korean";
import { formatProposalAmount } from "./purchaseFlow";
import type { Proposal, ProposalAttachment } from "./types";
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
    // 전결은 결재 요청과 동시에 승인되므로 기안(요청) 시각을 전결일로 쓴다 (품의서에는 따로 승인 시각을 저장하지 않는다)
    decidedAt: proposal.created_at,
  };

  const TH = "w-20 border border-border bg-bg px-3 py-3.5 text-center align-middle text-xs font-semibold text-text-muted";
  const TD = "border border-border px-3 py-3.5 align-top";
  const hasDeal = !!(proposal.vendor_name || formatProposalAmount(proposal) || proposal.project_name);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="relative bg-surface rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} aria-label="닫기" className="absolute right-4 top-4 text-text-muted hover:text-text">
          <X size={20} />
        </button>

        {/* 인쇄된 품의서 모양: 왼쪽 위 문서번호·기안일자, 오른쪽 위 결재칸, 가운데 제목, 아래 항목 표 */}
        <div className="flex items-start justify-between gap-4 pr-8">
          <div className="text-xs leading-relaxed text-text-muted">
            <p>No. {proposal.doc_no}</p>
            <p>기안일자 {proposal.issue_date}</p>
          </div>
          <ApprovalStampBox {...historyInput} />
        </div>

        <h3 className="my-4 text-center text-xl font-extrabold tracking-[0.3em]">{docTitle(proposal)}</h3>

        <div className="mb-3 empty:hidden">
          <ApprovalNote {...historyInput} />
        </div>

        <table className="mb-4 w-full border-collapse text-[13px] outline outline-1 -outline-offset-1 outline-[#b4b3b9]">
          <tbody>
            <tr>
              <th scope="row" className={`${TH} !border-[#b4b3b9]`}>제목</th>
              <td colSpan={3} className={`${TD} !border-[#b4b3b9]`}>{proposal.title}</td>
            </tr>
            <tr>
              <th scope="row" className={`${TH} ${hasDeal ? "" : "!border-b-[#b4b3b9]"}`}>기안자</th>
              <td className={`${TD} ${hasDeal ? "" : "!border-b-[#b4b3b9]"}`}>{proposal.creator_name}</td>
              <th scope="row" className={`${TH} ${hasDeal ? "" : "!border-b-[#b4b3b9]"}`}>기안부서</th>
              <td className={`${TD} ${hasDeal ? "" : "!border-b-[#b4b3b9]"}`}>{proposal.department_name}</td>
            </tr>
            {hasDeal && (
              <>
                <tr>
                  <th scope="row" className={TH}>프로젝트</th>
                  <td className={TD}>{proposal.project_name || "일반"}</td>
                  <th scope="row" className={TH}>금액</th>
                  <td className={`${TD} font-bold tabular-nums`}>{formatProposalAmount(proposal) ?? "-"}</td>
                </tr>
                <tr>
                  <th scope="row" className={`${TH} !border-b-[#b4b3b9]`}>거래처</th>
                  <td colSpan={3} className={`${TD} !border-b-[#b4b3b9]`}>{proposal.vendor_name || "-"}</td>
                </tr>
              </>
            )}
            <tr>
              <th scope="row" className={`${TH} !border-t-[#b4b3b9]`}>내용</th>
              <td colSpan={3} className={`${TD} leading-relaxed !border-t-[#b4b3b9]`}>
                <p>
                  1. 아래와 같이 {proposal.topic}
                  {objectParticle(proposal.topic)} 진행하고자 하오니 검토하여 승인해 주십시오.
                </p>
                <p className="mt-1 whitespace-pre-line text-text-muted">{proposal.content}</p>
              </td>
            </tr>
            <tr>
              <th scope="row" className={TH}>첨부</th>
              <td colSpan={3} className={TD}>
                {proposal.attachments.length === 0 && <p className="text-xs text-text-muted">첨부된 파일/링크가 없습니다.</p>}
                {proposal.attachments.length > 0 && (
                  <ul className="space-y-1">
                    {proposal.attachments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <button type="button" onClick={() => handleOpenAttachment(a)} className="flex min-w-0 items-center gap-2 text-left hover:text-primary">
                          {a.kind === "file" ? (
                            <Paperclip size={14} className="shrink-0 text-text-muted" />
                          ) : (
                            <LinkIcon size={14} className="shrink-0 text-text-muted" />
                          )}
                          <span className="truncate">{a.label}</span>
                          {a.kind === "link" && <ExternalLink size={11} className="shrink-0 text-text-muted" />}
                        </button>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          {a.kind === "file" && (
                            <button type="button" onClick={() => handleSaveAttachment(a)} aria-label={`${a.label} 저장`} title="내 PC에 저장" className="text-text-muted hover:text-primary">
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
                  <div className="mt-2 space-y-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-primary hover:opacity-80">
                      <Paperclip size={13} />
                      파일 추가
                      <input type="file" onChange={handleAddFile} disabled={attachmentBusy} className="hidden" />
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs outline-none focus:border-primary"
                      />
                      <input
                        value={linkLabel}
                        onChange={(e) => setLinkLabel(e.target.value)}
                        placeholder="설명 (선택)"
                        className="w-28 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={handleAddLink}
                        disabled={attachmentBusy}
                        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-bg disabled:opacity-50"
                      >
                        추가
                      </button>
                    </div>
                    {attachmentError && <p className="text-xs text-danger">{attachmentError}</p>}
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

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
