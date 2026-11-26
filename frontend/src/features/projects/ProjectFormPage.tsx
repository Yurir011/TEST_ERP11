import { ChevronDown, Copy, Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { DateField } from "../../components/ui/DateField";
import type { Client } from "../clients/types";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { Project } from "./types";

export function ProjectFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // 기존 프로젝트에서 불러오기: 평소에는 접어 두고, 프로젝트를 고르면 가져올 항목이 펼쳐진다.
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [importQuery, setImportQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [source, setSource] = useState<Project | null>(null);
  const [copyStages, setCopyStages] = useState(true);
  const [copyBom, setCopyBom] = useState(true);
  const [linkSeries, setLinkSeries] = useState(true);
  const importRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<Project[]>("/api/projects")
      .then((list) => {
        setAllProjects(list);
        // 상세 화면의 "＋ 다음 회차"로 들어오면 그 프로젝트를 바로 불러온다.
        const from = Number(searchParams.get("from"));
        const found = from ? list.find((p) => p.id === from) : undefined;
        if (found) void pickSource(found);
      })
      .catch((err) => logError("ProjectForm", "불러올 프로젝트 목록 조회 실패", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 같은 묶음(회차)이나 같은 이름의 프로젝트가 여럿이면 가장 최근(최종) 회차를 원본으로 삼는다.
  function latestRound(p: Project): Project {
    const same = allProjects.filter((x) => (p.series_id !== null ? x.series_id === p.series_id : x.name === p.name));
    const pool = same.length > 0 ? same : [p];
    return pool.reduce((best, x) => {
      const a = x.start_date ?? x.created_at.slice(0, 10);
      const b = best.start_date ?? best.created_at.slice(0, 10);
      return a > b || (a === b && x.id > best.id) ? x : best;
    });
  }

  async function pickSource(picked: Project, useLatest = false) {
    const p = useLatest ? latestRound(picked) : picked;
    logDebug("ProjectForm", `기존 프로젝트 불러오기: picked=${picked.id}, source=${p.id}, 최종회차=${useLatest}`);
    setSource(p);
    setImportQuery(p.name);
    setImportOpen(false);
    setName(p.name);
    setMemo(p.memo ?? "");
    try {
      const c = await apiGet<Client>(`/api/clients/${p.client_id}`);
      setSelectedClient(c);
      setClientQuery(c.name);
    } catch (err) {
      logError("ProjectForm", "불러온 프로젝트의 거래처 조회 실패", err);
      setClientQuery(p.client_name);
    }
  }

  function clearSource() {
    setSource(null);
    setImportQuery("");
  }

  const importMatches = [...new Map(allProjects.map((p) => [p.name, p])).values()].filter(
    (p) => !importQuery.trim() || p.name.toLowerCase().includes(importQuery.trim().toLowerCase()),
  );

  useEffect(() => {
    if (selectedClient || !showSuggestions) {
      return;
    }
    const timer = setTimeout(() => {
      const qs = clientQuery ? `?q=${encodeURIComponent(clientQuery)}` : "";
      apiGet<Client[]>(`/api/clients${qs}`)
        .then(setSuggestions)
        .catch((err) => logError("ProjectForm", "거래처 검색 실패", err));
    }, 200);
    return () => clearTimeout(timer);
  }, [clientQuery, selectedClient, showSuggestions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
      if (importRef.current && !importRef.current.contains(e.target as Node)) {
        setImportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pickClient(client: Client) {
    setSelectedClient(client);
    setClientQuery(client.name);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // 목록에서 고르지 않고 직접 적은 이름이 등록된 거래처 이름과 같으면 그 거래처로 연결하고, 아니면 서버가 이름으로 새로 등록한다.
    const typedName = clientQuery.trim();
    const client = selectedClient ?? suggestions.find((c) => c.name === typedName) ?? null;
    if (!client && !typedName) {
      setError("거래처를 선택하거나 이름을 입력해주세요.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await apiPost<Project>("/api/projects", {
        name,
        client_id: client?.id ?? null,
        client_name: client ? null : typedName,
        memo: memo || null,
        start_date: startDate || null,
        end_date: endDate || null,
        from_project_id: source?.id ?? null,
        copy_stages: !!source && copyStages,
        copy_bom: !!source && copyBom,
        link_series: !!source && linkSeries,
      });
      navigate(`/projects/${created.id}`, { replace: true });
    } catch (err) {
      logError("ProjectForm", "생성 실패", err);
      setError(err instanceof ApiError ? err.message : "생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title="새 프로젝트">
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-xl">
        <div className="relative" ref={importRef}>
          <label className="block text-xs text-text-muted mb-1.5">기존 프로젝트에서 불러오기 (선택)</label>
          <div className="relative">
            <Copy size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={importQuery}
              onChange={(e) => {
                setImportQuery(e.target.value);
                setImportOpen(true);
                if (source) setSource(null);
              }}
              onFocus={() => setImportOpen(true)}
              placeholder="눌러서 기존 프로젝트 고르기"
              className="w-full rounded-lg border border-border pl-9 pr-9 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
          {importOpen && importMatches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-lg shadow-sm max-h-56 overflow-y-auto">
              {importMatches.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => void pickSource(p, true)} className="w-full text-left px-3 py-2 text-sm hover:bg-bg">
                    {p.name}
                    <span className="text-text-muted"> · {p.client_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {source && (
            <div className="mt-2 rounded-lg border border-border bg-bg p-3 space-y-1.5 text-sm">
              <p className="text-xs text-text-muted">
                '{source.name}'의 이름·거래처·메모를 아래에 채웠습니다. 고쳐서 저장하세요. 일정은 새로 입력합니다.
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={copyStages} onChange={(e) => setCopyStages(e.target.checked)} />
                진행 단계 가져오기 (진행율은 0%로 시작)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={copyBom} onChange={(e) => setCopyBom(e.target.checked)} />
                BOM 가져오기
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={linkSeries} onChange={(e) => setLinkSeries(e.target.checked)} />
                다음 회차로 묶기 (목록에서 한 줄로 합치고 상세 화면에 회차 탭이 생깁니다)
              </label>
              <button type="button" onClick={clearSource} className="text-xs text-text-muted hover:text-text">
                불러오기 취소
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">프로젝트명</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            placeholder="예: ABC통신 5G 중계기 공급 프로젝트"
          />
        </div>

        <div className="relative" ref={boxRef}>
          <label className="block text-xs text-text-muted mb-1.5">거래처</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              required
              value={clientQuery}
              onChange={(e) => {
                setClientQuery(e.target.value);
                setSelectedClient(null);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="거래처명 검색 또는 직접 입력"
              className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-lg shadow-sm max-h-56 overflow-y-auto">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pickClient(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg"
                  >
                    {c.name}
                    {c.contacts[0] && <span className="text-text-muted"> · {c.contacts[0].name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedClient && <p className="text-xs text-success mt-1.5">선택됨: {selectedClient.name}</p>}
          {!selectedClient && clientQuery.trim() && !suggestions.some((c) => c.name === clientQuery.trim()) && (
            <p className="text-xs text-text-muted mt-1.5">
              등록되지 않은 거래처입니다. 이 이름으로 거래처가 새로 등록되며, 상세 정보는 거래처관리에서 채울 수 있습니다.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">시작일 (선택)</label>
            <DateField
              block
              aria-label="시작일"
              value={startDate}
              onChange={setStartDate}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">종료일 (선택)</label>
            <DateField
              block
              aria-label="종료일"
              value={endDate}
              onChange={setEndDate}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
        </div>
        <p className="text-xs text-text-muted -mt-2">
          시작일·종료일을 입력하면 대시보드의 '프로젝트 진행 현황' 차트에 표시됩니다.
        </p>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">메모 (선택)</label>
          <textarea
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
        >
          {isSubmitting ? "생성 중..." : "프로젝트 생성"}
        </button>
      </form>
    </MainLayout>
  );
}
