import { Download, Paperclip, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { downloadFile } from "../../lib/api";
import { openAttachment } from "../../lib/openAttachment";
import { logError } from "../../lib/logger";
import type { ProjectDocument } from "./types";

type Attachment = ProjectDocument["images"][number];

export const PURCHASE_ORDER_ATTACH_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt";

interface PurchaseOrderAttachmentsProps {
  /** 수정 중인 발주서 번호 (새로 쓰는 중이면 null). 이미 저장된 첨부를 내려받는 데 쓴다 */
  docId: number | null;
  files: File[];
  existing: Attachment[];
  onFilesSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onRemoveExisting: (id: number) => void;
}

/** 발주서 작성 화면의 "파일 첨부(선택)" 영역: 새로 고른 파일과(수정 시) 이미 첨부된 파일 목록 */
export function PurchaseOrderAttachmentsSection({ docId, files, existing, onFilesSelect, onRemoveFile, onRemoveExisting }: PurchaseOrderAttachmentsProps) {
  async function saveExisting(a: Attachment) {
    try {
      await downloadFile(`/api/project-documents/${docId}/images/${a.id}`, a.filename);
    } catch (err) {
      logError("PurchaseOrderAttachments", `첨부 저장 실패: image_id=${a.id}`, err);
    }
  }
  return (
    <div className="border border-dashed border-border rounded-xl px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Paperclip size={14} />
          파일 첨부 (선택)
        </span>
        <label className="flex items-center gap-1 text-xs text-primary hover:opacity-80 cursor-pointer">
          파일 선택
          <input type="file" multiple accept={PURCHASE_ORDER_ATTACH_ACCEPT} onChange={onFilesSelect} className="hidden" />
        </label>
      </div>
      <p className="text-[11px] text-text-muted mt-1">도면·사양서 등 이미지, PDF, 오피스 문서(파일당 15MB 이하)를 발주서와 함께 저장합니다.</p>
      {(existing.length > 0 || files.length > 0) && (
        <ul className="mt-2 space-y-1">
          {existing.map((a) => (
            <li key={`e-${a.id}`} className="flex items-center justify-between text-xs bg-bg rounded-lg px-2.5 py-1.5">
              <span className="truncate">{a.filename}</span>
              <span className="flex items-center gap-2 shrink-0 ml-2">
                {docId !== null && (
                  <button type="button" onClick={() => void saveExisting(a)} aria-label={`${a.filename} 저장`} title="내 PC에 저장" className="text-text-muted hover:text-primary">
                    <Download size={13} />
                  </button>
                )}
                <button type="button" onClick={() => onRemoveExisting(a.id)} aria-label={`${a.filename} 삭제`} className="text-text-muted hover:text-danger">
                  <X size={13} />
                </button>
              </span>
            </li>
          ))}
          {files.map((f, idx) => (
            <li key={`${f.name}-${idx}`} className="flex items-center justify-between text-xs bg-bg rounded-lg px-2.5 py-1.5">
              <span className="truncate">{f.name}</span>
              <button type="button" onClick={() => onRemoveFile(idx)} className="text-text-muted hover:text-danger">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 상세 화면: 첨부된 파일을 눌러 내려받는다 */
export function PurchaseOrderAttachments({ doc }: { doc: ProjectDocument }) {
  if (doc.images.length === 0) return null;
  async function handleDownload(a: Attachment) {
    try {
      await openAttachment(`/api/project-documents/${doc.id}/images/${a.id}`, a.filename);
    } catch (err) {
      logError("PurchaseOrderAttachments", `첨부 다운로드 실패: image_id=${a.id}`, err);
    }
  }
  return (
    <div className="mb-4">
      <p className="text-xs text-text-muted mb-1.5">첨부 파일 ({doc.images.length})</p>
      <ul className="space-y-1">
        {doc.images.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => handleDownload(a)}
              className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80 max-w-full"
            >
              <Download size={13} className="shrink-0" />
              <span className="truncate">{a.filename}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
