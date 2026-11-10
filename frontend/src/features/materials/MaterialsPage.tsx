import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { CATEGORY_BADGE, CATEGORY_LABELS, CATEGORY_ORDER, formatQty, levelPath, type Material, type MaterialCategory } from "./types";

function formatBrief(b: { movement_date: string; quantity: number } | null, sign: "+" | "-"): string {
  return b ? `${b.movement_date} (${sign}${formatQty(b.quantity)})` : "-";
}

/** 자재관리 목록: 항목(IC·사출물·부자재) 탭으로 걸러 보고, 이름·속성으로 찾는다. 행을 누르면 상세(입출고 기록)로 간다. */
export function MaterialsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | MaterialCategory>("all");
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

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const k of CATEGORY_ORDER) c[k] = rows?.filter((m) => m.category === k).length ?? 0;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return (rows ?? []).filter((m) => (tab === "all" || m.category === tab) && (!q || `${m.name} ${m.sub_levels.join(" ")}`.toLowerCase().includes(q)));
  }, [rows, tab, keyword]);

  const tabs: { key: "all" | MaterialCategory; label: string }[] = [{ key: "all", label: "전체" }, ...CATEGORY_ORDER.map((k) => ({ key: k, label: CATEGORY_LABELS[k] }))];

  return (
    <MainLayout
      title="자재관리"
      description="회로부품·사출물·부자재·소모품의 현재 개수와 입고·출고를 관리합니다."
      actions={
        <button type="button" onClick={() => navigate("/materials/new")} className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2.5">
          <Plus size={15} /> 자재 등록
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {tabs.map((t) => (
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
          placeholder="이름·속성 검색"
          aria-label="자재 검색"
          className="ml-auto w-64 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-surface"
        />
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-text-muted text-xs">
            <tr className="text-left border-b border-border">
              <th className="py-3 px-4 font-medium">항목 · 이름</th>
              <th className="py-3 px-4 font-medium">속성</th>
              <th className="py-3 px-4 font-medium text-right">현재 개수</th>
              <th className="py-3 px-4 font-medium">최근 입고</th>
              <th className="py-3 px-4 font-medium">최근 출고</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-text-muted">
                  불러오는 중...
                </td>
              </tr>
            )}
            {rows !== null && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-text-muted">
                  {rows.length === 0 ? "등록된 자재가 없습니다. [자재 등록]으로 추가해 주세요." : "조건에 맞는 자재가 없습니다."}
                </td>
              </tr>
            )}
            {shown.map((m) => (
              <tr
                key={m.id}
                onClick={() => navigate(`/materials/${m.id}`)}
                className="border-b border-border last:border-0 cursor-pointer hover:bg-bg"
              >
                <td className="py-3 px-4">
                  <span className={`px-2 py-0.5 text-xs font-semibold mr-2 ${CATEGORY_BADGE[m.category]}`}>{CATEGORY_LABELS[m.category]}</span>
                  <b>{m.name}</b>
                </td>
                <td className="py-3 px-4 text-xs text-text-muted">{levelPath(m.sub_levels) || "-"}</td>
                <td className="py-3 px-4 text-right font-bold tabular-nums">{formatQty(m.current_qty)}</td>
                <td className="py-3 px-4 text-xs tabular-nums">{formatBrief(m.last_in, "+")}</td>
                <td className="py-3 px-4 text-xs tabular-nums">{formatBrief(m.last_out, "-")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}
