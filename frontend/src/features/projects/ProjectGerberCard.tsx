import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiGet, apiUploadForm, downloadFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { Gerber } from "../gerber/types";

export interface GerbersState {
  rows: Gerber[] | null;
  error: string | null;
  busy: boolean;
  /** 파일 선택 창을 연다 ([거버 등록] 버튼용) */
  pick: () => void;
  upload: (files: File[]) => Promise<void>;
  remove: (g: Gerber) => Promise<void>;
  download: (g: Gerber) => Promise<void>;
  input: RefObject<HTMLInputElement | null>;
}

/**
 * 프로젝트의 거버 목록과 등록·삭제·받기. BOM 카드의 [Gerber] 버전 목록 팝업이 쓴다. 보기는 [Gerber Viewer] 새 창에서 한다.
 * 거버 zip(또는 거버 파일 여러 개)을 올리면 새 버전(Rev A, B ...)으로 쌓인다. 발주 연결·권한은 나중에 정한다 (지금은 로그인한 누구나).
 */
export function useGerbers(projectId: number): GerbersState {
  const dialog = useDialog();
  const [rows, setRows] = useState<Gerber[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      const message = err instanceof ApiError ? err.message : "거버를 등록하지 못했습니다.";
      setError(message);
      dialog.notifyError(message);
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

  return { rows, error, busy, pick: () => input.current?.click(), upload, remove, download, input };
}
