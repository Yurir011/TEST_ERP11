import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { SubLevelEditor } from "./SubLevelTree";
import { levelPath, type Material } from "./types";

/** 목록에서 체크한 자재들의 분류(속성 경로)를 한꺼번에 같은 값으로 바꾸는 창. 기존 분류는 덮어쓰이고, 개수·입출고 기록은 그대로다. */
export function BulkLevelsModal({ targets, onClose, onSaved }: { targets: Material[]; onClose: () => void; onSaved: () => void }) {
  const [levels, setLevels] = useState<string[]>([]);
  const [history, setHistory] = useState<string[][]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleaned = levels.map((v) => v.trim()).filter(Boolean);

  useEffect(() => {
    apiGet<{ levels: string[][] }>("/api/materials/level-history")
      .then((r) => setHistory(r.levels))
      .catch((err) => logError("BulkLevels", "이전 속성 조회 실패", err)); // 자동 완성만 빠질 뿐이라 조용히 넘어간다
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (cleaned.length === 0) {
      setError("바꿀 분류를 한 칸 이상 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      logDebug("BulkLevels", `분류 일괄 변경 시도: ${targets.length}건 → ${cleaned.join(" > ")}`);
      await apiPost("/api/materials/bulk-levels", { ids: targets.map((m) => m.id), sub_levels: cleaned });
      logDebug("BulkLevels", "분류 일괄 변경 성공");
      onSaved();
    } catch (err) {
      logError("BulkLevels", "분류 일괄 변경 실패", err);
      setError(err instanceof ApiError ? err.message : "분류를 바꾸지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:px-4" onClick={onClose}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="분류 일괄 변경"
        className="bg-surface rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">분류 일괄 변경</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">선택한 {targets.length}개 자재의 분류를 아래 값으로 바꿉니다. 지금 분류는 덮어쓰이고, 개수와 입출고 기록은 그대로입니다.</p>

        <ul className="mb-4 max-h-32 overflow-y-auto rounded-lg border border-border text-xs">
          {targets.map((m) => (
            <li key={m.id} className="flex justify-between gap-3 border-b border-border px-3 py-1.5 last:border-0">
              <span className="truncate font-medium">{m.name}</span>
              <span className="truncate text-text-muted">{levelPath(m.sub_levels) || "-"}</span>
            </li>
          ))}
        </ul>

        <SubLevelEditor levels={levels} onChange={setLevels} history={history} />

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg">
            취소
          </button>
          <button type="submit" disabled={saving || cleaned.length === 0} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "바꾸는 중..." : `${targets.length}개 분류 변경`}
          </button>
        </div>
      </form>
    </div>
  );
}
