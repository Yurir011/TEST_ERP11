import { X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { NumberInput } from "../../components/ui/NumberInput";
import { ApiError, apiPost } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { KIND_LABELS, OUT_REASONS, formatQty, type MaterialDetail, type MovementKind } from "./types";

const inputCls = "w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary bg-bg";

/**
 * 입고 / 추가 입고 / 출고 기록 창. 날짜와 개수를 적고, 출고는 사유가 반드시 있어야 저장된다
 * (자주 쓰는 사유를 눌러 고르고 자세한 내용은 아래 칸에 적는다). 출고하면 남는 개수를 미리 보여 준다.
 */
export function MovementModal({
  material,
  kind,
  onClose,
  onSaved,
}: {
  material: Pick<MaterialDetail, "id" | "name" | "current_qty">;
  kind: MovementKind;
  onClose: () => void;
  onSaved: (m: MaterialDetail) => void;
}) {
  const isOut = kind === "out";
  const [date, setDate] = useState(todayISO());
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(qty) || 0;
  const after = material.current_qty + (isOut ? -n : n);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (n <= 0) return setError("개수를 입력해주세요.");
    if (isOut && !reason.trim()) return setError("출고 사유를 선택하거나 입력해주세요.");
    if (isOut && n > material.current_qty) return setError(`현재 개수(${formatQty(material.current_qty)}개)보다 많이 출고할 수 없습니다.`);
    setBusy(true);
    try {
      logDebug("MaterialMovement", `${KIND_LABELS[kind]} 기록 시도: material_id=${material.id}, date=${date}, qty=${n}, reason=${reason}`);
      const saved = await apiPost<MaterialDetail>(`/api/materials/${material.id}/movements`, {
        kind,
        movement_date: date,
        quantity: n,
        reason: isOut ? reason.trim() : null,
        note: note.trim() || null,
      });
      onSaved(saved);
    } catch (err) {
      logError("MaterialMovement", "입출고 기록 실패", err);
      setError(err instanceof ApiError ? err.message : "저장하지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={`${KIND_LABELS[kind]} 기록`}
        className="bg-surface rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">{KIND_LABELS[kind]} 기록</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">
          <b className="text-text">{material.name}</b> · 현재 {formatQty(material.current_qty)}개
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="mv-date" className="block text-xs text-text-muted mb-1.5">
              {KIND_LABELS[kind]} 날짜 <span className="text-danger">*</span>
            </label>
            <input id="mv-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="mv-qty" className="block text-xs text-text-muted mb-1.5">
              {KIND_LABELS[kind]} 개수 <span className="text-danger">*</span>
            </label>
            <NumberInput id="mv-qty" value={qty} onChange={setQty} placeholder="0" className={inputCls} />
          </div>
        </div>

        <div className="flex justify-between rounded-lg bg-bg px-3 py-2 text-sm mb-3">
          <span className="text-text-muted">{isOut ? "출고 후 남는 개수" : "입고 후 개수"}</span>
          <b className={after < 0 ? "text-danger" : ""}>{formatQty(after)}개</b>
        </div>

        {isOut && (
          <div className="mb-3">
            <label className="block text-xs text-text-muted mb-1.5">
              출고 사유 <span className="text-danger">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="출고 사유 선택">
              {OUT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(reason === r ? "" : r)}
                  className={`rounded-full border px-3 py-1 text-xs ${reason === r ? "border-danger text-danger font-semibold bg-tile-red" : "border-border text-text-muted hover:bg-bg"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={100}
              aria-label="출고 사유"
              placeholder="위에서 고르거나 직접 입력"
              className={inputCls}
            />
          </div>
        )}

        <div className="mb-3">
          <label htmlFor="mv-note" className="block text-xs text-text-muted mb-1.5">
            {isOut ? "사유 자세히 (선택)" : "메모 (선택)"}
          </label>
          <textarea
            id="mv-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isOut ? "예: 시제품 4차 PCB 제작용" : "예: 2차 구매분"}
            className={`${inputCls} resize-y`}
          />
        </div>

        {error && <p className="text-xs text-danger mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className={`rounded-lg text-white text-sm font-medium px-6 py-2.5 disabled:opacity-60 ${isOut ? "bg-danger hover:opacity-90" : "bg-primary hover:bg-primary-hover"}`}
          >
            {busy ? "저장 중..." : `${KIND_LABELS[kind]} 저장`}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-border text-sm px-6 py-2.5 hover:bg-bg">
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
