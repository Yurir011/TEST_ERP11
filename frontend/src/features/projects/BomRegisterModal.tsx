import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { SubLevelEditor } from "../materials/SubLevelTree";
import { CATEGORY_CHIPS, type MaterialDetail } from "../materials/types";

/**
 * BOM 에 적은 자재가 재고 목록(자재관리)에 없을 때 새로 등록하는 창.
 * 품목·품명·속성만 적어 만들고(재고는 0개), 입고 개수는 자재관리에서 따로 기록한다. 등록이 끝나면 만든 자재를 돌려준다.
 */
export function BomRegisterModal({ initialName, onClose, onRegistered }: { initialName: string; onClose: () => void; onRegistered: (m: MaterialDetail) => void }) {
  const [chipKey, setChipKey] = useState("ic-general");
  const [name, setName] = useState(initialName);
  const [levels, setLevels] = useState<string[]>(["", "", ""]);
  const [history, setHistory] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chip = CATEGORY_CHIPS.find((c) => c.key === chipKey) ?? CATEGORY_CHIPS[0];

  useEffect(() => {
    apiGet<{ levels: string[][] }>("/api/materials/level-history")
      .then((r) => setHistory(r?.levels ?? []))
      .catch((err) => logError("BomRegister", "이전 속성 불러오기 실패 (입력은 계속 가능)", err));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const clean = name.trim();
    if (!clean) return setError("품명을 입력해 주세요.");
    setBusy(true);
    setError(null);
    try {
      logDebug("BomRegister", `자재관리에 등록 시도: category=${chip.category}, kind=${chip.kind}, name=${clean}`);
      const saved = await apiPost<MaterialDetail>("/api/materials", {
        category: chip.category,
        kind: chip.kind,
        name: clean,
        sub_levels: levels.map((v) => v.trim()).filter(Boolean),
        memo: null,
      });
      logDebug("BomRegister", `자재관리에 등록 성공: id=${saved.id}, code=${saved.code}`);
      onRegistered(saved);
    } catch (err) {
      logError("BomRegister", "자재관리에 등록 실패", err);
      setError(err instanceof ApiError ? err.message : "등록하지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:px-4" onClick={onClose}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="자재관리에 등록"
        className="bg-surface rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">자재관리에 등록</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">재고 목록에 새 자재를 만들고 이 BOM 줄에 연결합니다. 입고 개수는 자재관리에서 기록해 주세요.</p>

        <p className="text-xs text-text-muted mb-2">품목</p>
        <div className="flex flex-wrap gap-1.5 mb-4" role="radiogroup" aria-label="품목">
          {CATEGORY_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={chipKey === c.key}
              onClick={() => setChipKey(c.key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm ${chipKey === c.key ? "bg-primary border-primary text-white font-semibold" : "border-border bg-bg text-text hover:bg-surface"}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label htmlFor="bom-reg-name" className="block text-xs text-text-muted mb-1.5">
          품명
        </label>
        <input
          id="bom-reg-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary bg-bg mb-4"
        />

        <p className="text-xs text-text-muted mb-2">
          속성 <span className="opacity-70">· 비워도 됩니다</span>
        </p>
        <div className="mb-4">
          <SubLevelEditor levels={levels} onChange={setLevels} history={history} />
        </div>

        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg">
            취소
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "등록 중..." : "등록하고 BOM에 연결"}
          </button>
        </div>
      </form>
    </div>
  );
}
