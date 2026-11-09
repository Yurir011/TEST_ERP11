import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { CATEGORY_BADGE, CATEGORY_LABELS, CATEGORY_ORDER, formatQty, levelPath, type Material, type MaterialCategory } from "../materials/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

/** 모바일 자재 목록: 항목 칩(전체·회로부품·사출물·부자재·소모품)으로 걸러 보고, 이름·하위 속성으로 찾는다. 누르면 상세(입출고)로 간다. */
export function MobileMaterialsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | MaterialCategory>("all");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    logDebug("MobileMaterials", "자재 목록 조회 시작");
    apiGet<Material[]>("/api/materials")
      .then((r) => {
        logDebug("MobileMaterials", `자재 목록 조회 성공: ${r.length}건`);
        setRows(r);
      })
      .catch((err) => {
        logError("MobileMaterials", "자재 목록 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "자재 목록을 불러오지 못했습니다.");
      });
  }, []);

  const shown = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return (rows ?? []).filter((m) => (tab === "all" || m.category === tab) && (!q || `${m.name} ${m.sub_levels.join(" ")}`.toLowerCase().includes(q)));
  }, [rows, tab, keyword]);

  const chips: { key: "all" | MaterialCategory; label: string }[] = [{ key: "all", label: "전체" }, ...CATEGORY_ORDER.map((k) => ({ key: k, label: CATEGORY_LABELS[k] }))];
  const count = (k: "all" | MaterialCategory) => (k === "all" ? rows?.length : rows?.filter((m) => m.category === k).length) ?? 0;

  return (
    <MobileLayout
      title="자재"
      right={
        <Link to="/m/materials/new" aria-label="자재 등록" className="w-10 h-10 flex items-center justify-center text-primary">
          <Plus size={22} />
        </Link>
      }
    >
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" role="group" aria-label="항목">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={tab === c.key}
            onClick={() => setTab(c.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${tab === c.key ? "border-primary bg-tile-blue text-tile-blue-fg font-semibold" : "border-border bg-surface text-text-muted"}`}
          >
            {c.label} <span className="text-xs opacity-70">{count(c.key)}</span>
          </button>
        ))}
      </div>
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="이름·하위 속성 검색"
        aria-label="자재 검색"
        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-primary"
      />

      {error && <p className="text-xs text-danger">{error}</p>}
      {rows === null && !error && <MobileEmpty text="불러오는 중..." />}
      {rows !== null && shown.length === 0 && <MobileEmpty text={rows.length === 0 ? "등록된 자재가 없습니다. 오른쪽 위 +로 추가해 주세요." : "조건에 맞는 자재가 없습니다."} />}
      <div className="space-y-2.5">
        {shown.map((m) => (
          <button key={m.id} type="button" onClick={() => navigate(`/m/materials/${m.id}`)} className="w-full text-left active:opacity-60">
            <MobileCard className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className={`px-1.5 py-0.5 text-[11px] font-semibold mr-1.5 ${CATEGORY_BADGE[m.category]}`}>{CATEGORY_LABELS[m.category]}</span>
                  <b className="text-sm">{m.name}</b>
                </p>
                <p className="text-xs text-text-muted truncate mt-1">{levelPath(m.sub_levels) || "하위 속성 없음"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold tabular-nums leading-none">{formatQty(m.current_qty)}</p>
                <p className="text-[11px] text-text-muted mt-1">개</p>
              </div>
            </MobileCard>
          </button>
        ))}
      </div>
    </MobileLayout>
  );
}
