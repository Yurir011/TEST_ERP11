import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { GerberViewerModal } from "./GerberViewerModal";
import type { Gerber } from "./types";

/** Gerber Viewer 새 창(/gerber-viewer/:projectId). 최신 버전을 레이어 보기로 열고, 위쪽 목록에서 다른 버전으로 바꾼다. */
export function GerberViewerPage() {
  const { projectId } = useParams();
  const pid = Number(projectId);
  const [rows, setRows] = useState<Gerber[] | null>(null);
  const [current, setCurrent] = useState<Gerber | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Gerber Viewer";
    logDebug("GerberViewerPage", `거버 목록 조회 시작: project_id=${pid}`);
    apiGet<Gerber[]>(`/api/projects/${pid}/gerbers`)
      .then((r) => {
        logDebug("GerberViewerPage", `거버 목록 조회 성공: ${r.length}건`);
        setRows(r);
        setCurrent(r[0] ?? null);
      })
      .catch((err) => {
        logError("GerberViewerPage", "거버 목록 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "거버 목록을 불러오지 못했습니다.");
      });
  }, [pid]);

  if (error) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (rows === null) return <p className="p-6 text-sm text-text-muted">불러오는 중...</p>;
  if (!current) return <p className="p-6 text-sm text-text-muted">등록된 거버가 없습니다. 프로젝트 화면의 Gerber 버튼에서 먼저 등록하세요.</p>;
  return <GerberViewerModal projectId={pid} gerber={current} versions={rows} onPickVersion={setCurrent} />;
}
