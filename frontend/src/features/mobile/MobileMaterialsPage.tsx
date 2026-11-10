import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { CodeText } from "../materials/CodeText";
import { NewMaterialButton } from "../materials/NewMaterialButton";
import { LIST_TABS, classLabel, formatReelQty, matchKeyword, matchTab, type ListTab, type Material } from "../materials/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

/** 모바일 자재 목록 (시안 B-3): 한 행을 3줄로 — 윗줄 코드(대분류 색 블록), 가운데 품명, 아랫줄 분류(속성), 오른쪽에 개수. 긴 코드는 윗줄에서 …로 줄어든다. */
export function MobileMaterialsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>("all");
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

  const shown = useMemo(() => (rows ?? []).filter((m) => matchTab(m, tab) && matchKeyword(m, keyword)), [rows, tab, keyword]);
  const count = (k: ListTab) => (rows ?? []).filter((m) => matchTab(m, k)).length;

  return (
    <MobileLayout
      title="자재"
      right={<NewMaterialButton mobile />}
    >
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" role="group" aria-label="품목">
        {LIST_TABS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={tab === c.key}
            onClick={() => setTab(c.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${tab === c.key ? "border-primary bg-tile-blue text-tile-blue-fg font-semibold" : "border-border bg-surface text-text-muted"}`}
          >
            {c.short} <span className="text-xs opacity-70">{count(c.key)}</span>
          </button>
        ))}
      </div>
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="코드·품명·속성 검색"
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
                <CodeText code={m.code} small className="block truncate mb-0.5" />
                <b className="block text-sm truncate">{m.name}</b>
                <p className="text-xs text-text-muted truncate mt-0.5">{classLabel(m)}</p>
              </div>
              <div className="text-right shrink-0 max-w-[40%]">
                <p className="text-lg font-bold tabular-nums leading-tight break-keep">{formatReelQty(m.current_qty, m.current_reels)}</p>
              </div>
            </MobileCard>
          </button>
        ))}
      </div>
    </MobileLayout>
  );
}
