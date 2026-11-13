import { useCallback, useEffect, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiGet, apiUploadForm, downloadFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { VersionRow, VersionSource } from "./VersionListModal";

export type ProjectFileKind = "bom" | "pnp" | "kicad" | "step";

/** 프로젝트의 BOM·P&P·KiCad·STEP 파일 버전 목록·등록·삭제·받기. 팝업을 처음 열 때 불러온다. */
export function useProjectFiles(projectId: number, kind: ProjectFileKind, enabled: boolean): VersionSource {
  const dialog = useDialog();
  const tag = `ProjectFile:${kind}`;
  const base = `/api/projects/${projectId}/files/${kind}`;
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    logDebug(tag, `목록 조회 시작: project_id=${projectId}`);
    return apiGet<VersionRow[]>(base)
      .then((r) => {
        logDebug(tag, `목록 조회 성공: ${r.length}건`);
        setRows(r);
        setError(null);
      })
      .catch((err) => {
        logError(tag, "목록 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
      });
  }, [base, projectId, tag]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      logDebug(tag, `등록 시도: files=${files.length}`);
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const updated = await apiUploadForm<VersionRow[]>(base, form);
      logDebug(tag, `등록 성공: ${updated[0]?.revision}`);
      setRows(updated);
      dialog.notify(`${updated[0]?.revision ?? ""}으로 등록했습니다.`);
    } catch (err) {
      logError(tag, "등록 실패", err);
      const message = err instanceof ApiError ? err.message : "등록하지 못했습니다.";
      setError(message);
      dialog.notifyError(message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: VersionRow) {
    if (!(await dialog.confirm(`${row.revision}(${row.filename})을(를) 삭제할까요? 되돌릴 수 없습니다.`, { okLabel: "삭제", danger: true }))) return;
    try {
      logDebug(tag, `삭제 시도: id=${row.id}`);
      setRows(await apiDelete<VersionRow[]>(`${base}/${row.id}`));
    } catch (err) {
      logError(tag, "삭제 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  async function download(row: VersionRow) {
    try {
      logDebug(tag, `받기: id=${row.id}`);
      await downloadFile(`${base}/${row.id}/file`, row.filename);
    } catch (err) {
      logError(tag, "받기 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "파일을 받지 못했습니다.");
    }
  }

  return { rows, error, busy, upload, remove, download };
}
