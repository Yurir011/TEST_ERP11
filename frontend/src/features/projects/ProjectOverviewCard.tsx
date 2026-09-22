import { Link } from "react-router-dom";
import type { Project } from "./types";

const RING_R = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
const MAX_HIGHLIGHTS = 3;

type HighlightKind = "overdue" | "progress" | "done";

interface HighlightItem {
  project: Project;
  kind: HighlightKind;
}

const KIND_STYLES: Record<HighlightKind, { dot: string; label: string; pct: string }> = {
  overdue: { dot: "bg-danger", label: "text-danger", pct: "text-danger" },
  progress: { dot: "bg-tile-blue-fg", label: "text-text", pct: "text-text-faint" },
  done: { dot: "bg-tile-green-fg", label: "text-text", pct: "text-text-faint" },
};

function isOverdue(p: Project, today: string): boolean {
  return p.status === "in_progress" && !!p.end_date && p.end_date < today;
}

export function ProjectOverviewCard({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
        <p className="text-sm text-text-muted">등록된 프로젝트가 없습니다.</p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const active = projects.filter((p) => p.status !== "completed");
  const avgProgress =
    active.length === 0 ? 100 : Math.round(active.reduce((sum, p) => sum + p.progress_percent, 0) / active.length);
  const dashOffset = RING_CIRCUMFERENCE * (1 - avgProgress / 100);

  const overdue = projects.filter((p) => isOverdue(p, today));
  const inProgress = projects
    .filter((p) => p.status === "in_progress" && !isOverdue(p, today))
    .sort((a, b) => b.progress_percent - a.progress_percent);

  const highlights: HighlightItem[] = [
    ...overdue.map((project) => ({ project, kind: "overdue" as const })),
    ...inProgress.map((project) => ({ project, kind: "progress" as const })),
  ].slice(0, MAX_HIGHLIGHTS);

  if (highlights.length < MAX_HIGHLIGHTS) {
    const recentDone = projects
      .filter((p) => p.status === "completed")
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, MAX_HIGHLIGHTS - highlights.length)
      .map((project) => ({ project, kind: "done" as const }));
    highlights.push(...recentDone);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="grid grid-cols-[116px_1fr] gap-5 items-center">
        <div className="flex flex-col items-center gap-1">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={RING_R} fill="none" stroke="var(--color-border)" strokeWidth="10" />
            <circle
              cx="50"
              cy="50"
              r={RING_R}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
            />
            <text x="50" y="56" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--color-text)">
              {avgProgress}%
            </text>
          </svg>
          <span className="text-[10.5px] text-text-faint">평균 진행률</span>
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          {highlights.length === 0 && <p className="text-xs text-text-muted">주목할 프로젝트가 없습니다.</p>}
          {highlights.map(({ project, kind }) => {
            const style = KIND_STYLES[kind];
            return (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="flex items-center justify-between gap-2 text-xs hover:opacity-80"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                  <span className={`truncate ${style.label}`}>{project.name}</span>
                  {kind === "overdue" && (
                    <span className="text-[10px] font-medium text-danger bg-danger/10 px-1.5 py-0.5 rounded-full shrink-0">
                      지연
                    </span>
                  )}
                </span>
                <span className={`shrink-0 tabular-nums ${style.pct}`}>{project.progress_percent}%</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
