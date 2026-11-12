import { Download, Eye, FileArchive, Trash2, Upload } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiGet, apiUploadForm, downloadFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { formatBytes, type Gerber } from "../gerber/types";

// 뷰어(그리기 라이브러리 포함)는 [보기]를 처음 누를 때만 내려받는다
const GerberViewerModal = lazy(async () => ({ default: (await import("../gerber/GerberViewerModal")).GerberViewerModal }));

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * 프로젝트 상세의 "거버" 카드 (구매 카드 옆). 거버 zip(또는 거버 파일 여러 개)을 올리면 새 버전(Rev A, B ...)으로 쌓이고,
 * [보기]를 누르면 팝업 뷰어가 열려 브라우저에서 바로 그려 준다. 발주 연결·권한은 나중에 정한다 (지금은 로그인한 누구나).
 */
export function ProjectGerberCard({ projectId }: { projectId: number }) {
  const dialog = useDialog();
  const [rows, setRows] = useState<Gerber[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [viewing, setViewing] = useState<Gerber | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    logDebug("ProjectGerber", `거버 목록 조회 시작: project_id=${projectId}`);
    return apiGet<Gerber[]>(`/api/projects/${projectId}/gerbers`)
      .then((r) => {
        logDebug("ProjectGerber", `거버 목록 조회 성공: ${r.length}건`);
        setRows(r);
        setError(null);
      })
      .catch((err) => {
        logError("ProjectGerber", "거버 목록 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "거버 목록을 불러오지 못했습니다.");
      });
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      logDebug("ProjectGerber", `거버 등록 시도: project_id=${projectId}, files=${files.length}`);
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const updated = await apiUploadForm<Gerber[]>(`/api/projects/${projectId}/gerbers`, form);
      logDebug("ProjectGerber", `거버 등록 성공: ${updated[0]?.revision}`);
      setRows(updated);
      dialog.notify(`거버를 ${updated[0]?.revision ?? ""}으로 등록했습니다.`);
    } catch (err) {
      logError("ProjectGerber", "거버 등록 실패", err);
      setError(err instanceof ApiError ? err.message : "거버를 등록하지 못했습니다.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(g: Gerber) {
    if (!(await dialog.confirm(`거버 ${g.revision}(${g.filename})을(를) 삭제할까요? 되돌릴 수 없습니다.`, { okLabel: "삭제", danger: true }))) return;
    try {
      logDebug("ProjectGerber", `거버 삭제 시도: id=${g.id}`);
      setRows(await apiDelete<Gerber[]>(`/api/projects/${projectId}/gerbers/${g.id}`));
    } catch (err) {
      logError("ProjectGerber", "거버 삭제 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  async function download(g: Gerber) {
    try {
      await downloadFile(`/api/projects/${projectId}/gerbers/${g.id}/file`, g.filename);
    } catch (err) {
      logError("ProjectGerber", "거버 받기 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "파일을 받지 못했습니다.");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void upload([...e.dataTransfer.files]);
  }

  return (
    <section className="mb-6" aria-label="프로젝트 거버">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-medium text-text-muted">거버</h2>
        {rows !== null && <span className="text-xs text-text-muted">{rows.length}벌</span>}
        <input ref={input} id="gerber-files" type="file" multiple className="hidden" aria-label="거버 파일 선택" onChange={(e) => void upload([...(e.target.files ?? [])])} />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          <Upload size={14} /> {busy ? "올리는 중..." : "거버 등록"}
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      <div className="space-y-2">
        {rows === null && !error && <p className="text-sm text-text-muted">불러오는 중...</p>}
        {rows?.map((g) => (
          <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3">
            <FileArchive size={18} className="shrink-0 text-text-muted" aria-hidden />
            <div className="min-w-0 flex-1 basis-44">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {g.revision}
                {g.is_latest && <span className="rounded-full bg-tile-green px-2 py-0.5 text-[11px] font-bold text-tile-green-fg">최신</span>}
              </p>
              <p className="break-words text-xs text-text-muted">
                {fmtDate(g.created_at)}
                {g.uploaded_by ? ` · ${g.uploaded_by}` : ""} · 파일 {g.layer_names.length}개 · {formatBytes(g.file_size)}
              </p>
              {g.note && <p className="mt-0.5 break-words text-xs text-text-muted">{g.note}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setViewing(g)} className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-tile-blue">
                <Eye size={14} /> 보기
              </button>
              <button type="button" onClick={() => void download(g)} aria-label={`${g.revision} 받기`} title="zip 받기" className="rounded-lg border border-border p-2 text-text-muted hover:bg-bg">
                <Download size={14} />
              </button>
              <button type="button" onClick={() => void remove(g)} aria-label={`${g.revision} 삭제`} title="삭제" className="rounded-lg border border-border p-2 text-text-muted hover:bg-bg hover:text-danger">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-2xl border-[1.5px] border-dashed px-4 py-4 text-center text-xs ${dragOver ? "border-primary bg-tile-blue text-primary" : "border-border text-text-muted"}`}
        >
          {rows !== null && rows.length === 0 ? "등록된 거버가 없습니다. " : ""}거버 zip 또는 거버 파일들을 여기에 끌어다 놓으세요. 올릴 때마다 새 버전(Rev)으로 쌓입니다.
        </div>
      </div>

      {viewing && (
        <Suspense fallback={null}>
          <GerberViewerModal projectId={projectId} gerber={viewing} onClose={() => setViewing(null)} />
        </Suspense>
      )}
    </section>
  );
}
