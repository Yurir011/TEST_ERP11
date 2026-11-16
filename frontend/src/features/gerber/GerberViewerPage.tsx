import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { GerberViewerModal } from "./GerberViewerModal";
import type { Gerber } from "./types";

interface ReleaseRow {
  id: number;
  version: string;
  release_date: string;
  files: { id: number; category: string; filename: string; file_size: number; created_at: string }[];
}

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
    // 프로젝트 파일 관리의 Gerber 항목(zip)을 최신 버전부터, 그 뒤에 예전 방식으로 올린 거버를 모은다
    Promise.all([apiGet<Gerber[]>(`/api/projects/${pid}/gerbers`), apiGet<ReleaseRow[]>(`/api/projects/${pid}/releases`)])
      .then(([old, releases]) => {
        const fromReleases: Gerber[] = releases.flatMap((rel) =>
          rel.files
            .filter((f) => f.category === "gerber" && /\.zip$/i.test(f.filename))
            .map((f) => ({
              id: -f.id, // 예전 거버 id 와 겹치지 않게 음수로
              project_id: pid,
              revision: rel.version,
              filename: f.filename,
              file_size: f.file_size,
              layer_names: [],
              note: null,
              uploaded_by: null,
              created_at: f.created_at,
              is_latest: false,
              file_url: `/api/projects/${pid}/releases/${rel.id}/files/${f.id}/file`,
            })),
        );
        const r = [...fromReleases, ...old];
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
  if (!current) return <p className="p-6 text-sm text-text-muted">등록된 거버가 없습니다. 프로젝트 화면 파일 관리의 Gerber 항목에 zip 파일을 먼저 올려 주세요.</p>;
  return <GerberViewerModal projectId={pid} gerber={current} versions={rows} onPickVersion={setCurrent} />;
}
