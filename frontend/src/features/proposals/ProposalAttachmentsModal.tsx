import { Download, ExternalLink, Paperclip, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiUpload, downloadFile, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { Proposal, ProposalAttachment } from "./types";

/** 품의서 한 건에 올릴 수 있는 첨부 파일 수 (서버와 같은 값: backend/app/routers/proposals/_common.py) */
export const MAX_PROPOSAL_FILES = 7;
/** 파일 하나의 최대 크기 (서버와 같은 값) */
export const MAX_PROPOSAL_FILE_BYTES = 15 * 1024 * 1024;
/** 올릴 수 있는 형식: 이미지(PNG·JPG)와 문서(PDF·엑셀·워드·파워포인트·텍스트). 최종 확인은 서버가 파일 내용으로 한다. */
export const PROPOSAL_FILE_ACCEPT = ".png,.jpg,.jpeg,.pdf,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.txt";
const ALLOWED_EXTENSIONS = PROPOSAL_FILE_ACCEPT.split(",").map((e) => e.slice(1));

export const fileCountOf = (p: Proposal) => p.attachments.filter((a) => a.kind === "file").length;

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** 브라우저가 새 창에서 바로 보여 줄 수 있는 형식 (그 밖의 엑셀·워드 등은 내려받는다) */
const VIEWABLE_EXTENSIONS = ["png", "jpg", "jpeg", "pdf", "txt"];
export const isViewableInBrowser = (name: string) => VIEWABLE_EXTENSIONS.includes(extensionOf(name));

/** 고른 파일 중 올릴 수 있는 것만 남기고, 못 올리는 이유를 모아 돌려준다 (남은 칸 수·형식·크기 기준). */
export function pickUploadable(files: File[], remaining: number): { accepted: File[]; problems: string[] } {
  const accepted: File[] = [];
  const problems: string[] = [];
  for (const f of files) {
    if (!ALLOWED_EXTENSIONS.includes(extensionOf(f.name))) problems.push(`${f.name}: 올릴 수 없는 형식입니다.`);
    else if (f.size > MAX_PROPOSAL_FILE_BYTES) problems.push(`${f.name}: 파일 크기는 15MB를 넘을 수 없습니다.`);
    else if (accepted.length >= remaining) problems.push(`${f.name}: 첨부파일은 최대 ${MAX_PROPOSAL_FILES}개까지 올릴 수 있습니다.`);
    else accepted.push(f);
  }
  return { accepted, problems };
}

interface Props {
  proposal: Proposal;
  /** 작성자만 올리고 지울 수 있다 (서버 규칙) */
  canEdit: boolean;
  onChanged: (updated: Proposal) => void;
  onClose: () => void;
}

/** 구매 품의서 카드의 첨부 버튼: 거래명세서·세금계산서 등 관련 서류를 올린다 (최대 7개). */
export function ProposalAttachmentsModal({ proposal, canEdit, onChanged, onClose }: Props) {
  const { confirm } = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const count = fileCountOf(proposal);
  const remaining = MAX_PROPOSAL_FILES - count;

  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const { accepted, problems: rejected } = pickUploadable(files, remaining);
    const failed = [...rejected];
    let current = proposal;
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      setUploading(`${file.name} (${i + 1}/${accepted.length})`);
      logDebug("ProposalAttachments", `첨부 업로드: proposal_id=${proposal.id}, filename=${file.name}`);
      try {
        current = await apiUpload<Proposal>(`/api/proposals/${proposal.id}/attachments/file`, file);
        onChanged(current);
      } catch (err) {
        logError("ProposalAttachments", "첨부 업로드 실패", err);
        failed.push(`${file.name}: ${err instanceof ApiError ? err.message : "업로드 중 오류가 발생했습니다."}`);
      }
    }
    setUploading(null);
    setProblems(failed);
  }

  async function handleDelete(a: ProposalAttachment) {
    if (!(await confirm(`"${a.label}" 첨부를 삭제할까요?`, { okLabel: "삭제", danger: true }))) return;
    try {
      onChanged(await apiDelete<Proposal>(`/api/proposals/${proposal.id}/attachments/${a.id}`));
      setProblems([]);
    } catch (err) {
      logError("ProposalAttachments", "첨부 삭제 실패", err);
      setProblems([err instanceof ApiError ? err.message : "삭제 중 오류가 발생했습니다."]);
    }
  }

  /** 이름을 누르면 바로 연다: 링크는 새 창, PDF·이미지는 새 창에서 보기, 그 밖의 문서는 내려받기 */
  function handleOpen(a: ProposalAttachment) {
    if (a.kind === "link" && a.url) {
      window.open(a.url, "_blank");
      return;
    }
    const path = `/api/proposals/${proposal.id}/attachments/${a.id}/file`;
    logDebug("ProposalAttachments", `첨부 열기: attachment_id=${a.id}, ${isViewableInBrowser(a.label) ? "새 창" : "내려받기"}`);
    const run = isViewableInBrowser(a.label) ? openFile(path) : downloadFile(path, a.label);
    run.catch((err) => {
      logError("ProposalAttachments", "첨부 열기 실패", err);
      setProblems([err instanceof ApiError ? err.message : "파일을 열지 못했습니다."]);
    });
  }

  /** 항상 내려받기 (열 수 있는 형식이어도 저장하고 싶을 때) */
  function handleDownload(a: ProposalAttachment) {
    downloadFile(`/api/proposals/${proposal.id}/attachments/${a.id}/file`, a.label).catch((err) => {
      logError("ProposalAttachments", "다운로드 실패", err);
      setProblems([err instanceof ApiError ? err.message : "파일을 내려받지 못했습니다."]);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="첨부 파일"
        className="w-full max-w-lg rounded-2xl bg-surface border border-border p-5 shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">첨부 파일</h2>
            <p className="text-xs text-text-muted mt-0.5 truncate" title={proposal.title}>
              {proposal.title}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded text-text-muted hover:bg-bg hover:text-text">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">거래명세서·세금계산서 등 관련 서류를 올려 주세요. PNG, JPG, PDF, XLS, XLSX, DOC, DOCX, PPT, PPTX, TXT · 파일당 15MB · 최대 {MAX_PROPOSAL_FILES}개</p>

        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" aria-label="첨부 개수">
            첨부 {count}/{MAX_PROPOSAL_FILES}
          </span>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={remaining <= 0 || uploading !== null}
                title={remaining <= 0 ? `첨부파일은 최대 ${MAX_PROPOSAL_FILES}개까지 올릴 수 있습니다.` : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={14} />
                파일 올리기
              </button>
              <input ref={fileRef} type="file" multiple accept={PROPOSAL_FILE_ACCEPT} hidden aria-label="올릴 파일" onChange={(e) => void handleSelect(e)} />
            </>
          ) : (
            <span className="text-xs text-text-muted">작성자만 파일을 올릴 수 있습니다.</span>
          )}
        </div>

        {uploading && <p className="text-xs text-primary mb-2">올리는 중: {uploading}</p>}
        {problems.length > 0 && (
          <ul role="alert" className="mb-2 space-y-0.5 text-xs text-danger">
            {problems.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}

        <div className="overflow-y-auto min-h-0">
          {proposal.attachments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg p-6 text-center text-xs text-text-muted">첨부된 파일이 없습니다.</div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {proposal.attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm">
                  <Paperclip size={14} className="shrink-0 text-text-muted" />
                  <button
                    type="button"
                    onClick={() => handleOpen(a)}
                    aria-label={`${a.label} 열기`}
                    title={a.kind === "link" || isViewableInBrowser(a.label) ? "누르면 새 창에서 열립니다" : "누르면 내려받습니다 (이 형식은 브라우저에서 바로 열 수 없습니다)"}
                    className="flex-1 min-w-0 truncate text-left hover:text-primary hover:underline underline-offset-2"
                  >
                    {a.label}
                  </button>
                  {a.kind === "link" ? (
                    <ExternalLink size={14} className="shrink-0 text-text-muted" aria-hidden />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownload(a)}
                      aria-label={`${a.label} 내려받기`}
                      title="내려받기"
                      className="shrink-0 rounded p-1 text-text-muted hover:text-primary"
                    >
                      <Download size={14} />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(a)}
                      aria-label={`${a.label} 삭제`}
                      title="삭제"
                      className="shrink-0 rounded p-1 text-text-muted hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
