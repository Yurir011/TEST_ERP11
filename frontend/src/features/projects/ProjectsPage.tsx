import { FolderKanban, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { ProjectStageBoard } from "./ProjectStageBoard";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES, type Project, type ProjectStatus } from "./types";

function isOverdue(p: Project, today: string): boolean {
  return p.status === "in_progress" && !!p.end_date && p.end_date < today;
}

const BAR_COLOR: Record<ProjectStatus, string> = {
  estimate: "bg-tile-orange-fg",
  in_progress: "bg-tile-blue-fg",
  completed: "bg-tile-green-fg",
};

const TABS: { key: ProjectStatus | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "estimate", label: "견적" },
  { key: "in_progress", label: "진행" },
  { key: "completed", label: "완료" },
];

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [allProjects, setAllProjects] = useState<Project[] | null>(null);
  const [tab, setTab] = useState<ProjectStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadProjects(status: ProjectStatus | "all", q: string) {
    logDebug("Projects", `목록 조회: status=${status}, q=${q}`);
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    const path = params.toString() ? `/api/projects?${params.toString()}` : "/api/projects";
    apiGet<Project[]>(path)
      .then(setProjects)
      .catch((err) => {
        logError("Projects", "목록 조회 실패", err);
        setError("프로젝트 목록을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    const timer = setTimeout(() => loadProjects(tab, query), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query]);

  useEffect(() => {
    logDebug("Projects", "프로젝트 진행 현황(단계별 보드) 조회 시작");
    apiGet<Project[]>("/api/projects")
      .then(setAllProjects)
      .catch((err) => logError("Projects", "프로젝트 진행 현황 조회 실패", err));
  }, []);

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <MainLayout
      title="프로젝트관리"
      description="프로젝트를 관리하고 견적서·거래명세서를 작성합니다."
      actions={
        <Link
          to="/projects/new"
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          새 프로젝트
        </Link>
      }
    >
      <section className="mb-8">
        <h2 className="text-sm font-medium text-text-muted mb-3">프로젝트 진행 현황</h2>
        {allProjects === null ? (
          <p className="text-sm text-text-muted">불러오는 중...</p>
        ) : (
          <ProjectStageBoard projects={allProjects} />
        )}
      </section>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                tab === t.key ? "bg-bg font-medium text-text shadow-sm" : "text-text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="프로젝트명 검색"
            className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary bg-surface"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}
      {projects === null && !error && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {projects !== null && projects.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <FolderKanban className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">{query ? "검색 결과가 없습니다." : "해당하는 프로젝트가 없습니다."}</p>
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2.5 px-4 font-medium">프로젝트</th>
                <th className="py-2.5 px-4 font-medium">거래처</th>
                <th className="py-2.5 px-4 font-medium">진행률</th>
                <th className="py-2.5 px-4 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const overdue = isOverdue(p, todayISO);
                return (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-bg/60"
                  >
                    <td className={`py-3 px-4 font-medium ${overdue ? "text-danger" : "text-text"}`}>
                      {p.name}
                      {overdue && <span className="text-[11px] font-normal ml-1.5">· 지연</span>}
                    </td>
                    <td className="py-3 px-4 text-text-muted">{p.client_name}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-bg overflow-hidden shrink-0">
                          <div
                            className={`h-full rounded-full ${overdue ? "bg-danger" : BAR_COLOR[p.status]}`}
                            style={{ width: `${p.progress_percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-text-muted tabular-nums">{p.progress_percent}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${PROJECT_STATUS_STYLES[p.status]}`}>
                        {PROJECT_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </MainLayout>
  );
}
