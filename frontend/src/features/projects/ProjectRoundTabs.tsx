import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { roundPeriod } from "./rounds";
import type { Project } from "./types";

// 상세 화면 제목 바로 밑의 회차 탭 (올해 회차만, 1회차부터). 진행 중인 회차는 파란색으로 채운다.
export function ProjectRoundTabs({ project }: { project: Project }) {
  const [rounds, setRounds] = useState<Project[]>([]);

  useEffect(() => {
    if (project.series_id === null) {
      setRounds([]);
      return;
    }
    logDebug("ProjectRounds", `회차 탭 조회: project_id=${project.id}, series_id=${project.series_id}`);
    apiGet<Project[]>(`/api/projects/${project.id}/rounds`)
      .then((list) => setRounds(list.filter((r) => r.round_no !== null)))
      .catch((err) => logError("ProjectRounds", "회차 탭 조회 실패", err));
    // 상태·일정이 바뀌어도 탭 표시가 따라가도록 함께 본다
  }, [project.id, project.series_id, project.status, project.start_date, project.end_date]);

  if (project.series_id === null) return null;

  return (
    <div className="flex items-end gap-1 mb-6 px-2 border-b border-border" role="tablist" aria-label="회차">
      {rounds.map((r) => {
        const selected = r.id === project.id;
        const active = r.status === "in_progress";
        const period = roundPeriod(r);
        return (
          <Link
            key={r.id}
            to={`/projects/${r.id}`}
            role="tab"
            aria-selected={selected}
            className={`-mb-px rounded-t-xl border px-4 py-2 text-left transition-colors ${
              active ? "bg-primary border-primary text-white" : "bg-bg border-border text-text-muted hover:text-text"
            } ${selected ? "border-b-surface" : ""}`}
            style={selected ? { borderBottomColor: active ? "var(--color-primary)" : "var(--color-surface)" } : undefined}
          >
            <span className="block text-sm font-semibold">{r.round_no}회차</span>
            <span className={`block text-[11px] ${active ? "text-white/85" : "text-text-muted"}`}>
              {active ? "● 진행" : ""}
              {active && period ? " · " : ""}
              {period}
            </span>
          </Link>
        );
      })}
      <Link
        to={`/projects/new?from=${project.id}`}
        className="mb-1 ml-1 flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-text-muted hover:text-primary hover:border-primary"
      >
        <Plus size={13} />
        다음 회차
      </Link>
    </div>
  );
}
