import { FolderKanban, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES, type Project, type ProjectStatus } from "./types";

const TABS: { key: ProjectStatus | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "estimate", label: "견적" },
  { key: "in_progress", label: "진행" },
  { key: "completed", label: "완료" },
];

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
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
        <div className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="flex items-center justify-between bg-surface border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors"
            >
              <div>
                <h2 className="font-medium text-text">{p.name}</h2>
                <p className="text-xs text-text-muted mt-1">{p.client_name}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${PROJECT_STATUS_STYLES[p.status]}`}>
                {PROJECT_STATUS_LABELS[p.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </MainLayout>
  );
}
