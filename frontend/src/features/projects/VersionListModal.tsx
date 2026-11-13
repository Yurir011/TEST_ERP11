import { Download, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { formatBytes } from "../gerber/types";

export interface VersionRow {
  id: number;
  revision: string;
  filename: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
  is_latest: boolean;
  note?: string | null;
}

export interface VersionSource {
  rows: VersionRow[] | null;
  error: string | null;
  busy: boolean;
  upload: (files: File[]) => Promise<void>;
  remove: (row: VersionRow) => Promise<void>;
  download: (row: VersionRow) => Promise<void>;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** 버전 목록 팝업(표). BOM·Gerber·P&P·KiCad·STEP 이 같이 쓴다. 올리면 새 버전(Rev)으로 쌓이고, 줄마다 [받기]·삭제가 있다. */
export function VersionListModal({
  title,
  source,
  accept,
  extra,
  onClose,
}: {
  title: string;
  source: VersionSource;
  accept?: string;
  /** 제목 줄 아래에 붙일 안내·버튼 */
  extra?: React.ReactNode;
  onClose: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const pickerId = `version-upload-${title}`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void source.upload([...e.dataTransfer.files]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-6" onClick={onClose}>
      <div role="dialog" aria-label={`${title} 버전`} onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">{title} 버전</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="ml-auto rounded-lg p-1.5 text-text-muted hover:bg-bg">
            <X size={18} />
          </button>
        </div>
        {extra}
        {source.error && <p className="text-sm text-danger">{source.error}</p>}

        <label
          htmlFor={pickerId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed px-3 py-3 text-center text-xs ${dragOver ? "border-primary bg-tile-blue text-primary" : "border-border text-text-muted hover:bg-bg"}`}
        >
          <Upload size={14} aria-hidden />
          {source.busy ? "올리는 중..." : "새 버전 올리기: 파일을 끌어다 놓거나 클릭 (올릴 때마다 Rev 가 자동으로 올라갑니다)"}
        </label>
        <input
          id={pickerId}
          type="file"
          multiple
          accept={accept}
          disabled={source.busy}
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void source.upload(files);
          }}
        />

        <div className="min-h-0 overflow-auto">
          {source.rows === null && !source.error && <p className="py-6 text-center text-sm text-text-muted">불러오는 중...</p>}
          {source.rows !== null && source.rows.length === 0 && <p className="py-6 text-center text-sm text-text-muted">등록된 버전이 없습니다.</p>}
          {source.rows !== null && source.rows.length > 0 && (
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold text-text-muted">
                  <th className="px-2 py-1.5">버전</th>
                  <th className="px-2 py-1.5">파일</th>
                  <th className="px-2 py-1.5">크기</th>
                  <th className="px-2 py-1.5">올린 사람 · 날짜</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {source.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="whitespace-nowrap px-2 py-2 font-semibold">
                      {r.revision}
                      {r.is_latest && <span className="ml-1.5 rounded-full bg-tile-green px-2 py-0.5 text-[11px] font-bold text-tile-green-fg">최신</span>}
                    </td>
                    <td className="break-all px-2 py-2">
                      {r.filename}
                      {r.note && <span className="block text-xs text-text-muted">{r.note}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-text-muted">{formatBytes(r.file_size)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-text-muted">
                      {r.uploaded_by ? `${r.uploaded_by} · ` : ""}
                      {fmtDate(r.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <button type="button" onClick={() => void source.download(r)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-bg">
                        <Download size={13} /> 받기
                      </button>
                      <button type="button" onClick={() => void source.remove(r)} aria-label={`${r.revision} 삭제`} title="삭제" className="ml-1 rounded-lg border border-border p-1.5 text-text-muted hover:bg-bg hover:text-danger">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
