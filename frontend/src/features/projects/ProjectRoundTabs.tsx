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

  // 지금 보는 탭은 아래 카드와 같은 면으로 이어지고, 진행 중인 회차만 테마 포인트 색으로 불이 켜진다. 나머지는 꺼진 듯 흐리게.
  return (
    <div className="flex items-end gap-1 mb-6 px-2" role="tablist" aria-label="회차">
      {rounds.map((r) => {
        const selected = r.id === project.id;
        const active = r.status === "in_progress";
        const period = roundPeriod(r);
        const style = active
          ? { background: "var(--color-primary)", color: "var(--color-on-primary)", boxShadow: "0 0 14px color-mix(in srgb, var(--color-primary) 55%, transparent)" }
          : selected
            ? { background: "var(--color-surface)", color: "var(--color-text-muted)" }
            : {
                background: "color-mix(in srgb, var(--color-text-muted) 12%, var(--color-surface))",
                color: "color-mix(in srgb, var(--color-text-muted) 65%, var(--color-surface))",
              };
        return (
          <Link
            key={r.id}
            to={`/projects/${r.id}`}
            role="tab"
            aria-selected={selected}
            style={style}
            className="rounded-t-xl px-4 py-2 text-left transition-colors"
          >
            <span className="block text-sm font-semibold" style={selected && !active ? { color: "var(--color-text)" } : undefined}>
              {r.round_no}회차
            </span>
            <span className="block text-[11px]">
              {active && (
                <span
                  aria-hidden
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-[1px]"
                  style={{ background: "var(--color-on-primary)", boxShadow: "0 0 6px var(--color-on-primary)" }}
                />
              )}
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
