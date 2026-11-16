import { useCallback, useEffect, useRef, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUploadForm, downloadFile } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { formatBytes } from "../gerber/types";

export type ReleaseCategory = "bom" | "gerber" | "pnp" | "kicad" | "step" | "firmware" | "gui";
export const RELEASE_CATEGORIES: { key: ReleaseCategory; label: string; grouped: boolean }[] = [
  { key: "bom", label: "BOM", grouped: false },
  { key: "gerber", label: "Gerber", grouped: false },
  { key: "pnp", label: "Pick Place", grouped: false },
  { key: "kicad", label: "KiCad", grouped: false },
  { key: "step", label: "STEP", grouped: false },
  { key: "firmware", label: "Firmware", grouped: true },
  { key: "gui", label: "GUI", grouped: true },
];

export interface ReleaseFile {
  id: number;
  category: ReleaseCategory;
  group: "bin" | "src" | null;
  filename: string;
  file_size: number;
  created_at: string;
}
export interface Release {
  id: number;
  project_id: number;
  version: string;
  release_date: string; // YYYY-MM-DD
  files: ReleaseFile[];
}

const fmtDate = (iso: string) => iso.replace(/-/g, "/");
const iconBtn = "h-9 min-w-10 rounded-lg border border-border bg-surface px-2 text-base hover:border-primary disabled:opacity-50";

/**
 * 프로젝트 파일 관리: 왼쪽 히스토리(파일 버전, 최신순) → 가운데 7개 항목(BOM·Gerber·Pick Place·KiCad·STEP·Firmware·GUI) → 오른쪽 파일.
 * [파일 등록](윗줄 버튼)으로 새 버전 이름을 적으면 히스토리에 올라가고, 항목마다 파일을 올린다. Firmware·GUI 는 bin / src 로 나뉜다.
 * 히스토리 아래 ➕ ➖ ✏️ 는 버전 추가·삭제·이름 고치기, 파일 목록 아래 ➕ ✏️ 🗑️ 는 파일 올리기·이름 바꾸기·지우기다.
 */
export function ProjectReleasePanel({
  projectId,
  formOpen,
  setFormOpen,
  onOpenBom,
  onOpenGerberViewer,
}: {
  projectId: number;
  formOpen: boolean;
  setFormOpen: (open: boolean) => void;
  onOpenBom: () => void;
  onOpenGerberViewer: () => void;
}) {
  const dialog = useDialog();
  const base = `/api/projects/${projectId}/releases`;
  const [rows, setRows] = useState<Release[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [curId, setCurId] = useState<number | null>(null);
  const [cat, setCat] = useState<ReleaseCategory>("bom");
  const [group, setGroup] = useState<"bin" | "src">("bin"); // Firmware·GUI 에 올릴 때 고른 묶음
  const [mode, setMode] = useState<"edit" | "del" | null>(null);
  const [version, setVersion] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    logDebug("ProjectRelease", `파일 버전 조회 시작: project_id=${projectId}`);
    return apiGet<Release[]>(`/api/projects/${projectId}/releases`)
      .then((r) => {
        logDebug("ProjectRelease", `파일 버전 조회 성공: ${r.length}건`);
        setRows(r);
        setError(null);
      })
      .catch((err) => {
        logError("ProjectRelease", "파일 버전 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "파일 버전을 불러오지 못했습니다.");
      });
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cur = rows?.find((r) => r.id === curId) ?? rows?.[0] ?? null;
  const catInfo = RELEASE_CATEGORIES.find((c) => c.key === cat)!;
  const catFiles = (cur?.files ?? []).filter((f) => f.category === cat);

  function replaceRelease(updated: Release) {
    setRows((rs) => (rs ?? []).map((r) => (r.id === updated.id ? updated : r)));
  }

  function fail(label: string, err: unknown, fallback: string) {
    logError("ProjectRelease", label, err);
    dialog.notifyError(err instanceof ApiError ? err.message : fallback);
  }

  async function register() {
    const v = version.trim();
    if (!v) return;
    setBusy(true);
    try {
      logDebug("ProjectRelease", `파일 버전 등록 시도: ${v}`);
      const created = await apiPost<Release>(base, { version: v, release_date: date });
      await load();
      setCurId(created.id);
      setVersion("");
      setFormOpen(false);
    } catch (err) {
      fail("파일 버전 등록 실패", err, "파일 버전을 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRelease() {
    if (!cur) return;
    if (!(await dialog.confirm(`${cur.version} 과 올려 둔 파일 ${cur.files.length}개를 모두 삭제할까요? 되돌릴 수 없습니다.`, { okLabel: "삭제", danger: true }))) return;
    try {
      logDebug("ProjectRelease", `파일 버전 삭제 시도: id=${cur.id}`);
      await apiDelete(`${base}/${cur.id}`);
      setCurId(null);
      await load();
    } catch (err) {
      fail("파일 버전 삭제 실패", err, "삭제하지 못했습니다.");
    }
  }

  async function editRelease() {
    if (!cur) return;
    const v = await dialog.prompt(`'${cur.version}' 의 새 버전 이름을 입력해 주세요.`, { okLabel: "저장", placeholder: cur.version });
    if (!v || !v.trim() || v.trim() === cur.version) return;
    try {
      replaceRelease(await apiPut<Release>(`${base}/${cur.id}`, { version: v.trim(), release_date: cur.release_date }));
    } catch (err) {
      fail("파일 버전 수정 실패", err, "수정하지 못했습니다.");
    }
  }

  async function upload(files: File[]) {
    if (!cur || files.length === 0) return;
    setBusy(true);
    try {
      logDebug("ProjectRelease", `파일 올리기 시도: release=${cur.id}, category=${cat}, files=${files.length}`);
      const form = new FormData();
      form.append("category", cat);
      if (catInfo.grouped) form.append("group", group);
      files.forEach((f) => form.append("files", f));
      replaceRelease(await apiUploadForm<Release>(`${base}/${cur.id}/files`, form));
    } catch (err) {
      fail("파일 올리기 실패", err, "파일을 올리지 못했습니다.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function renameFile(f: ReleaseFile) {
    if (!cur) return;
    const name = await dialog.prompt("새 파일 이름을 입력해 주세요.", { okLabel: "저장", placeholder: f.filename });
    if (!name || !name.trim() || name.trim() === f.filename) return;
    try {
      replaceRelease(await apiPut<Release>(`${base}/${cur.id}/files/${f.id}`, { filename: name.trim() }));
    } catch (err) {
      fail("파일 이름 변경 실패", err, "이름을 바꾸지 못했습니다.");
    }
  }

  async function removeFile(f: ReleaseFile) {
    if (!cur) return;
    if (!(await dialog.confirm(`${f.filename} 을(를) 삭제할까요? 되돌릴 수 없습니다.`, { okLabel: "삭제", danger: true }))) return;
    try {
      replaceRelease(await apiDelete<Release>(`${base}/${cur.id}/files/${f.id}`));
    } catch (err) {
      fail("파일 삭제 실패", err, "삭제하지 못했습니다.");
    }
  }

  async function download(f: ReleaseFile) {
    if (!cur) return;
    try {
      await downloadFile(`${base}/${cur.id}/files/${f.id}/file`, f.filename);
    } catch (err) {
      fail("파일 받기 실패", err, "파일을 받지 못했습니다.");
    }
  }

  function fileRow(f: ReleaseFile) {
    return (
      <div key={f.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
        <span aria-hidden>📄</span>
        <button type="button" onClick={() => void download(f)} title="눌러서 받기" className="min-w-0 flex-1 break-all text-left hover:text-primary hover:underline">
          {f.filename}
        </button>
        <span className="shrink-0 text-xs text-text-muted">{formatBytes(f.file_size)}</span>
        {mode === "edit" && (
          <button type="button" onClick={() => void renameFile(f)} aria-label={`${f.filename} 이름 바꾸기`} className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs hover:border-primary">
            이름 바꾸기
          </button>
        )}
        {mode === "del" && (
          <button type="button" onClick={() => void removeFile(f)} aria-label={`${f.filename} 삭제`} className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-danger hover:border-danger">
            🗑️ 삭제
          </button>
        )}
      </div>
    );
  }

  const modeBtn = (m: "edit" | "del") => `${iconBtn} ${mode === m ? "border-primary bg-tile-blue" : ""}`;

  return (
    <div className="border-t border-border px-4 py-4" aria-label="프로젝트 파일 관리">
      {formOpen && (
        <form
          className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void register();
          }}
        >
          <label htmlFor="release-version" className="text-sm text-text-muted">
            파일 버전
          </label>
          <input
            id="release-version"
            autoFocus
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="예: V.1.20.000"
            maxLength={30}
            className="min-w-0 flex-1 basis-40 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input type="date" aria-label="버전 날짜" value={date} max="2999-12-31" onChange={(e) => setDate(e.target.value || todayISO())} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary" />
          <button type="submit" disabled={busy || !version.trim()} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50">
            등록
          </button>
          <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg">
            취소
          </button>
        </form>
      )}
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {rows === null && !error && <p className="py-4 text-center text-sm text-text-muted">불러오는 중...</p>}

      {rows !== null && (
        <div className="grid gap-4 md:grid-cols-[200px_180px_minmax(0,1fr)]">
          {/* 히스토리 */}
          <div className="min-w-0 md:border-r md:border-border md:pr-4">
            <b className="mb-2 block text-sm">히스토리</b>
            {rows.length === 0 && <p className="py-3 text-xs text-text-muted">[파일 등록]으로 첫 버전을 만들어 주세요.</p>}
            {rows.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <div className="ml-1.5 text-xl leading-none text-text-muted" aria-hidden>⇧</div>}
                <button
                  type="button"
                  aria-pressed={cur?.id === r.id}
                  onClick={() => setCurId(r.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left ${cur?.id === r.id ? "border-primary bg-tile-blue" : "border-transparent hover:bg-bg"}`}
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-text-muted" aria-hidden />
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{r.version}</b>
                    <span className="text-xs text-text-muted">{fmtDate(r.release_date)}</span>
                  </span>
                </button>
              </div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" title="버전 추가" aria-label="버전 추가" onClick={() => setFormOpen(true)} className={iconBtn}>
                ➕
              </button>
              <button type="button" title="선택한 버전 삭제" aria-label="선택한 버전 삭제" onClick={() => void removeRelease()} disabled={!cur} className={iconBtn}>
                ➖
              </button>
              <button type="button" title="선택한 버전 이름 고치기" aria-label="선택한 버전 이름 고치기" onClick={() => void editRelease()} disabled={!cur} className={iconBtn}>
                ✏️ <small>Edit</small>
              </button>
            </div>
          </div>

          {/* 7개 항목 */}
          {cur && (
            <div className="min-w-0 md:border-r md:border-border md:pr-4">
              <b className="mb-2 block truncate text-sm">{cur.version}</b>
              <div className="grid gap-2">
                {RELEASE_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={cat === c.key}
                    onClick={() => setCat(c.key)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm ${cat === c.key ? "border-primary bg-tile-blue font-bold" : "border-border bg-bg hover:border-primary"}`}
                  >
                    {c.label}
                    <span className="text-xs font-normal text-text-muted">{cur.files.filter((f) => f.category === c.key).length || ""}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 파일 */}
          {cur && (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm">{catInfo.label}</b>
                <span className="text-xs text-text-muted">· {cur.version}</span>
                {cat === "bom" && (
                  <button type="button" onClick={onOpenBom} className="ml-auto rounded-lg border border-border bg-bg px-2.5 py-1 text-xs font-medium hover:border-primary">
                    BOM 표 열기
                  </button>
                )}
                {cat === "gerber" && (
                  <button type="button" onClick={onOpenGerberViewer} className="ml-auto rounded-lg border border-border bg-bg px-2.5 py-1 text-xs font-medium hover:border-primary">
                    Gerber Viewer
                  </button>
                )}
              </div>
              <div className="mt-2.5 grid gap-1.5">
                {catInfo.grouped ? (
                  (["bin", "src"] as const).map((g) => (
                    <div key={g}>
                      <p className="mb-1 mt-1 text-xs font-semibold text-text-muted">{g}</p>
                      <div className="grid gap-1.5">
                        {catFiles.filter((f) => f.group === g).map(fileRow)}
                        {catFiles.filter((f) => f.group === g).length === 0 && <p className="text-xs text-text-muted">파일 없음</p>}
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    {catFiles.map(fileRow)}
                    {catFiles.length === 0 && <p className="text-xs text-text-muted">올린 파일이 없습니다. 아래 ➕ 로 올려 주세요.</p>}
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {catInfo.grouped && (
                  <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs" role="group" aria-label="올릴 묶음">
                    {(["bin", "src"] as const).map((g) => (
                      <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={`px-2.5 py-2 ${group === g ? "bg-tile-blue font-bold" : "bg-surface"}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" title="파일 올리기" aria-label="파일 올리기" onClick={() => input.current?.click()} disabled={busy} className={iconBtn}>
                  ➕
                </button>
                <button type="button" title="이름 바꾸기" aria-label="파일 이름 바꾸기 모드" aria-pressed={mode === "edit"} onClick={() => setMode(mode === "edit" ? null : "edit")} className={modeBtn("edit")}>
                  ✏️
                </button>
                <button type="button" title="삭제" aria-label="파일 삭제 모드" aria-pressed={mode === "del"} onClick={() => setMode(mode === "del" ? null : "del")} className={modeBtn("del")}>
                  🗑️
                </button>
                {busy && <span className="text-xs text-text-muted">올리는 중...</span>}
              </div>
              <input
                ref={input}
                type="file"
                multiple
                className="hidden"
                aria-label="파일 선택"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = "";
                  void upload(files);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
