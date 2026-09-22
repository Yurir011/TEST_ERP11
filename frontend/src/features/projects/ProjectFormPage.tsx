import { Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { Client } from "../clients/types";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { logError } from "../../lib/logger";
import type { Project } from "./types";

export function ProjectFormPage() {
  const navigate = useNavigate();

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
    if (!selectedClient) {
      setError("거래처를 목록에서 선택해주세요.");
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
        client_id: selectedClient.id,
        memo: memo || null,
        start_date: startDate || null,
        end_date: endDate || null,
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
              placeholder="거래처명 검색"
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
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">시작일 (선택)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">종료일 (선택)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
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
