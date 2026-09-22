import { Link } from "react-router-dom";
import type { Project, ProjectStatus } from "./types";

const MAX_PER_COLUMN = 4;
const RING_R = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

const COLUMNS: {
  status: ProjectStatus;
  label: string;
  bg: string;
  dot: string;
  text: string;
  ring: string;
}[] = [
  { status: "estimate", label: "견적", bg: "bg-tile-orange", dot: "bg-tile-orange-fg", text: "text-tile-orange-fg", ring: "var(--color-tile-orange-fg)" },
  { status: "in_progress", label: "진행", bg: "bg-tile-blue", dot: "bg-tile-blue-fg", text: "text-tile-blue-fg", ring: "var(--color-tile-blue-fg)" },
  { status: "completed", label: "완료", bg: "bg-tile-green", dot: "bg-tile-green-fg", text: "text-tile-green-fg", ring: "var(--color-tile-green-fg)" },
];

function isOverdue(p: Project, today: string): boolean {
  return p.status === "in_progress" && !!p.end_date && p.end_date < today;
}

function ProgressRing({ percent, colorVar }: { percent: number; colorVar: string }) {
  const offset = RING_CIRCUMFERENCE * (1 - percent / 100);
  return (
    <div className="relative w-9 h-9 shrink-0">
      <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r={RING_R} fill="none" stroke="var(--color-border)" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r={RING_R}
          fill="none"
          stroke={colorVar}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: colorVar }}>
        {percent}%
      </span>
    </div>
  );
}

interface ProjectStageBoardProps {
  projects: Project[];
}

export function ProjectStageBoard({ projects }: ProjectStageBoardProps) {
  const today = new Date().toISOString().slice(0, 10);

  if (projects.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
        <p className="text-sm text-text-muted">등록된 프로젝트가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3.5">
      {COLUMNS.map((col) => {
        const items = projects.filter((p) => p.status === col.status);
        const shown = items.slice(0, MAX_PER_COLUMN);
        const hiddenCount = items.length - shown.length;

        return (
          <div key={col.status} className={`min-w-0 rounded-2xl p-3.5 ${col.bg}`}>
            <div className="flex items-center justify-between mb-3 px-0.5">
              <span className={`flex items-center gap-1.5 text-sm font-semibold ${col.text}`}>
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                {col.label}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-white/60 ${col.text}`}>
                {items.length}
              </span>
            </div>

            {shown.length === 0 && <p className={`text-xs px-1 ${col.text} opacity-60`}>해당 프로젝트가 없습니다.</p>}

            <div className="space-y-2">
              {shown.map((p) => {
                const overdue = isOverdue(p, today);
                const ringColor = overdue ? "var(--color-danger)" : col.ring;
                return (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className={`flex items-center gap-2.5 bg-surface border rounded-xl p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
                      overdue ? "border-danger" : "border-border"
                    }`}
                  >
                    <ProgressRing percent={p.progress_percent} colorVar={ringColor} />
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${overdue ? "text-danger" : "text-text"}`}>
                        {p.name}
                      </p>
                      <p className="text-[11px] text-text-muted truncate mt-0.5">
                        {p.client_name}
                        {overdue && <span className="text-danger"> · 지연</span>}
                      </p>
                    </div>
                  </Link>
                );
              })}
              {hiddenCount > 0 && (
                <p className={`text-[11px] text-center pt-1 ${col.text} opacity-70`}>+{hiddenCount}개 더</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
