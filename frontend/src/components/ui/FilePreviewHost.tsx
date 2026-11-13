import { Download, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { MIME_BY_EXT, previewKind, registerFilePreview, type PreviewRequest } from "../../lib/filePreview";

const MAX_TEXT_BYTES = 1024 * 1024;
const formatSize = (n: number) => (n < 1024 ? `${n}B` : n < 1024 * 1024 ? `${Math.round(n / 1024)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);

/**
 * 첨부파일 미리보기 팝업 (App 에서 한 번만 둔다). 사진·PDF·글자 파일은 팝업 안에서 바로 보이고,
 * 그 밖의 형식은 받기 안내가 나온다. 바깥을 누르거나 Esc 로 닫는다.
 */
export function FilePreviewHost() {
  const [req, setReq] = useState<PreviewRequest | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    registerFilePreview(setReq);
    return () => registerFilePreview(null);
  }, []);

  const kind = req ? previewKind(req.filename, req.blob.type) : "other";

  useEffect(() => {
    if (!req) return;
    let objectUrl: string | null = null;
    let alive = true;
    setText(null);
    if (kind === "image" || kind === "pdf") {
      const ext = req.filename.split(".").pop()?.toLowerCase() ?? "";
      const type = MIME_BY_EXT[ext] ?? req.blob.type;
      objectUrl = URL.createObjectURL(type && req.blob.type !== type ? new Blob([req.blob], { type }) : req.blob);
      setUrl(objectUrl);
    } else if (kind === "text") {
      setUrl(null);
      void req.blob.slice(0, MAX_TEXT_BYTES).text().then((t) => alive && setText(t));
    } else {
      setUrl(null);
    }
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [req, kind]);

  useEffect(() => {
    if (!req) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setReq(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;

  function save() {
    if (!req) return;
    const a = document.createElement("a");
    const href = URL.createObjectURL(req.blob);
    a.href = href;
    a.download = req.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setReq(null)}>
      <div role="dialog" aria-modal="true" aria-label={`${req.filename} 미리보기`} onClick={(e) => e.stopPropagation()} className="flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <h2 className="min-w-0 truncate text-sm font-semibold" title={req.filename}>
            {req.filename}
          </h2>
          <span className="shrink-0 text-xs text-text-muted">{formatSize(req.blob.size)}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={save} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-bg">
              <Download size={13} /> 받기
            </button>
            {url && (
              <button type="button" onClick={() => window.open(url, "_blank")} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-bg">
                <ExternalLink size={13} /> 새 창
              </button>
            )}
            <button type="button" onClick={() => setReq(null)} aria-label="닫기" className="rounded-lg p-1.5 text-text-muted hover:bg-bg">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-bg">
          {kind === "image" && url && (
            <div className="grid min-h-full place-items-center p-4">
              <img src={url} alt={req.filename} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {kind === "pdf" && url && <iframe src={url} title={req.filename} className="h-full w-full border-0" />}
          {kind === "text" && <pre className="whitespace-pre-wrap break-words p-4 text-xs">{text ?? "불러오는 중..."}</pre>}
          {kind === "other" && (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-text-muted">
              <div>
                <p>이 형식은 팝업에서 미리 볼 수 없습니다.</p>
                <p className="mt-1">[받기]로 저장한 뒤 열어 주세요.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
