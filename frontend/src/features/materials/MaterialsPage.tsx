import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { CodeText } from "./CodeText";
import { LIST_TABS, formatReelQty, levelPath, matchKeyword, matchTab, type ListTab, type Material } from "./types";

/** 자재관리 목록 (시안 B-2): 품목 코드 · 품명 · 분류(속성) · 개수 네 칸만 보여 준다. 위 탭으로 걸러 보고, 코드·품명·속성으로 찾는다. 행을 누르면 상세(입출고 기록)로 간다. */
export function MaterialsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>("all");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    logDebug("Materials", "자재 목록 조회 시작");
    apiGet<Material[]>("/api/materials")
      .then((r) => {
        logDebug("Materials", `자재 목록 조회 성공: ${r.length}건`);
        setRows(r);
      })
      .catch((err) => {
        logError("Materials", "자재 목록 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "자재 목록을 불러오지 못했습니다.");
      });
  }, []);

  const counts = useMemo(() => Object.fromEntries(LIST_TABS.map((t) => [t.key, (rows ?? []).filter((m) => matchTab(m, t.key)).length])), [rows]);
  const shown = useMemo(() => (rows ?? []).filter((m) => matchTab(m, tab) && matchKeyword(m, keyword)), [rows, tab, keyword]);

  return (
    <MainLayout
      title="자재관리"
      description="회로부품·사출물·부자재·포장재·소모품의 현재 개수와 입고·출고를 관리합니다."
      actions={
        <button type="button" onClick={() => navigate("/materials/new")} className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2.5">
          <Plus size={15} /> 자재 등록
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {LIST_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`rounded-full border px-4 py-1.5 text-sm ${tab === t.key ? "border-primary bg-tile-blue text-tile-blue-fg font-semibold" : "border-border text-text-muted hover:bg-bg"}`}
          >
            {t.label} <span className="text-xs opacity-70">{counts[t.key]}</span>
          </button>
        ))}
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="코드·품명·속성 검색"
          aria-label="자재 검색"
          className="ml-auto w-64 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-surface"
        />
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-text-muted text-xs">
            <tr className="text-left border-b border-border">
              <th className="py-3 px-4 font-medium w-px whitespace-nowrap">품목 코드</th>
              <th className="py-3 px-4 font-medium">품명</th>
              <th className="py-3 px-4 font-medium">분류</th>
              <th className="py-3 px-4 font-medium text-right w-px whitespace-nowrap">개수</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-text-muted">
                  불러오는 중...
                </td>
              </tr>
            )}
            {rows !== null && shown.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-text-muted">
                  {rows.length === 0 ? "등록된 자재가 없습니다. [자재 등록]으로 추가해 주세요." : "조건에 맞는 자재가 없습니다."}
                </td>
              </tr>
            )}
            {shown.map((m) => (
              <tr key={m.id} onClick={() => navigate(`/materials/${m.id}`)} className="border-b border-border last:border-0 cursor-pointer hover:bg-bg">
                <td className="py-3 px-4 w-px whitespace-nowrap">
                  <CodeText code={m.code} />
                </td>
                <td className="py-3 px-4 max-w-0 truncate font-semibold" title={m.name}>
                  {m.name}
                </td>
                <td className="py-3 px-4 max-w-0 truncate text-text-muted" title={levelPath(m.sub_levels)}>
                  {levelPath(m.sub_levels) || "-"}
                </td>
                <td className="py-3 px-4 text-right font-bold tabular-nums whitespace-nowrap">{formatReelQty(m.current_qty, m.current_reels)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}
