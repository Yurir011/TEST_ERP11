import { Download } from "lucide-react";
import { formatCurrency } from "../../lib/format";
import type { SalesDocument } from "./types";

export function DocColumn({
  doc,
  label,
  onDownload,
  isDownloading,
}: {
  doc?: SalesDocument;
  label: string;
  onDownload: (doc: SalesDocument) => void;
  isDownloading: boolean;
}) {
  if (!doc) {
    return (
      <div className="flex-1 px-5 py-4 text-sm text-text-muted">
        {label} 없음
      </div>
    );
  }
  return (
    <div className="flex-1 px-5 py-4">
      <p className="text-sm font-medium">
        {label} · {doc.doc_no}
      </p>
      <p className="text-xs text-text-muted mt-1">합계 {formatCurrency(doc.total)}</p>
      <button
        onClick={() => onDownload(doc)}
        disabled={isDownloading}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 disabled:opacity-50 mt-3"
      >
        <Download size={14} />
        {isDownloading ? "다운로드 중..." : "다운로드"}
      </button>
    </div>
  );
}
