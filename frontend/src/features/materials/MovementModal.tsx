import { X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { NumberInput } from "../../components/ui/NumberInput";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiPost } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { QtyInput, emptyQty, qtyPayload, qtyTotal, type QtyState } from "./QtyInput";
import { KIND_LABELS, OUT_REASONS, formatQty, formatReelQty, type MaterialDetail, type Movement, type MovementKind } from "./types";

/** 재입고로 더 정산할 수 있는 출고 건들: 출고 개수에서 이미 반납·사용으로 정산된 개수를 뺀 것이 남아 있는 건. */
export function returnableOuts(movements: Movement[] | undefined): (Movement & { remaining: number })[] {
  return (movements ?? [])
    .filter((x) => x.kind === "out")
    .map((x) => ({ ...x, remaining: x.quantity - (x.returned_qty ?? 0) - (x.used_total ?? 0) }))
    .filter((x) => x.remaining > 0);
}

const outLabel = (x: Movement) => `${x.movement_date} 출고 ${formatQty(x.quantity)}개${x.reason ? ` (${x.reason})` : ""}`;

const inputCls = "w-full rounded-lg border border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary bg-bg";

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
  material: Pick<MaterialDetail, "id" | "name" | "current_qty"> & Partial<Pick<MaterialDetail, "current_reels" | "movements">>;
  kind: MovementKind;
  onClose: () => void;
  onSaved: (m: MaterialDetail) => void;
}) {
  const dialog = useDialog();
  const isOut = kind === "out";
  const isReturn = kind === "return";
  const outs = returnableOuts(material.movements);
  const [target, setTarget] = useState<number | null>(outs[0]?.id ?? null); // 재입고: 어느 출고 건의 반납인지
  const [used, setUsed] = useState(""); // 재입고: 그중 실제 사용한 개수 (비워 두면 로스를 계산하지 않는다)
  const [date, setDate] = useState(todayISO());
  const [qty, setQty] = useState<QtyState>(emptyQty());
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = qtyTotal(qty); // 총 개수 (릴이면 릴 수 × 1릴 당 개수)
  const after = material.current_qty + (isOut ? -n : n);
  const out = outs.find((x) => x.id === target);
  // 재입고 정산 미리보기: 이미 정산된 개수와 이번 입력을 합쳐 로스(출고 − 반납 − 사용)를 계산한다. 사용 개수를 하나도 안 적었으면 사용·로스는 0 으로 보인다.
  const usedNow = Number(used) || 0;
  const retTotal = out ? out.quantity - out.remaining - (out.used_total ?? 0) + n : 0; // 이미 반납된 개수 + 이번 반납
  const usedTotal = (out?.used_total ?? 0) + usedNow;
  const anyUsed = used !== "" || out?.used_total != null;
  const loss = out && anyUsed ? out.quantity - retTotal - usedTotal : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const payload = qtyPayload(qty);
    if (!payload) return setError(qty.unit === "reel" ? "릴 수와 1릴 당 개수를 입력해주세요." : "개수를 입력해주세요.");
    if (isOut && !reason.trim()) return setError("출고 사유를 선택하거나 입력해주세요.");
    if (isReturn && !out) return setError("어느 출고 건의 재입고인지 골라주세요.");
    if (isReturn && out && retTotal + usedTotal > out.quantity) {
      logDebug("MaterialMovement", `재입고 경고: 출고=${out.quantity}, 반납+사용=${retTotal + usedTotal}`);
      await dialog.confirm(`반납(${formatQty(retTotal)}개)과 사용(${formatQty(usedTotal)}개)의 합이 출고한 개수(${formatQty(out.quantity)}개)보다 많습니다.\n개수를 다시 확인해 주세요.`, { okLabel: "확인", danger: true });
      return;
    }
    if (isOut && n > material.current_qty) {
      // 입고(현재 개수)보다 많이 출고하려 하면 경고 창을 띄우고 저장하지 않는다
      logDebug("MaterialMovement", `출고 경고: 요청=${n}, 현재=${material.current_qty}`);
      await dialog.confirm(`출고 개수(${formatQty(n)}개)가 현재 개수(${formatReelQty(material.current_qty, material.current_reels)})보다 많아 출고할 수 없습니다.
개수를 다시 확인해 주세요.`, { okLabel: "확인", danger: true });
      return;
    }
    setBusy(true);
    try {
      logDebug("MaterialMovement", `${KIND_LABELS[kind]} 기록 시도: material_id=${material.id}, date=${date}, qty=${n}, unit=${qty.unit}, reason=${reason}`);
      const saved = await apiPost<MaterialDetail>(`/api/materials/${material.id}/movements`, {
        kind,
        movement_date: date,
        ...payload,
        ...(isReturn ? { return_of: target, used_qty: used !== "" ? usedNow : null } : {}),
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
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:px-4" onClick={onClose}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={`${KIND_LABELS[kind]} 기록`}
        className="bg-surface rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">{KIND_LABELS[kind]} 기록</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">
          <b className="text-text">{material.name}</b> · 현재 {formatReelQty(material.current_qty, material.current_reels)}
        </p>

        {isReturn && (
          <div className="mb-3">
            <label htmlFor="mv-target" className="block text-xs text-text-muted mb-1.5">
              어느 출고 건의 반납인가요? <span className="text-danger">*</span>
            </label>
            {outs.length === 0 ? (
              <p className="text-xs text-danger">재입고할 출고 기록이 없습니다. (출고한 뒤 남은 자재를 돌려받을 때 기록합니다)</p>
            ) : (
              <select id="mv-target" value={target ?? ""} onChange={(e) => setTarget(Number(e.target.value))} className={inputCls}>
                {outs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {outLabel(x)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 mb-3">
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
            <QtyInput id="mv-qty" label={KIND_LABELS[kind]} value={qty} onChange={setQty} />
          </div>
        </div>

        {isReturn && out && (
          <>
            <div className="mb-3">
              <label htmlFor="mv-used" className="block text-xs text-text-muted mb-1.5">
                그중 실제 사용한 개수 (선택)
              </label>
              <NumberInput id="mv-used" value={used} onChange={setUsed} placeholder="모르면 비워 두세요" className={inputCls} />
            </div>
            <div className={`rounded-lg px-3 py-2.5 text-sm mb-3 ${loss < 0 ? "bg-tile-red" : "bg-tile-orange/50"}`} aria-label="로스 계산">
              <div className="flex justify-between">
                <span className="text-text-muted">출고</span>
                <span className="tabular-nums">{formatQty(out.quantity)}개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">− 재입고(반납)</span>
                <span className="tabular-nums">{formatQty(retTotal)}개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">− 사용</span>
                <span className="tabular-nums">{formatQty(usedTotal)}개</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-border mt-1.5 pt-1.5 font-bold">
                <span>로스</span>
                <span className={`tabular-nums ${loss < 0 ? "text-danger" : "text-tile-orange-fg"}`}>
                  {loss < 0 ? `합계가 출고보다 ${formatQty(-loss)}개 많음` : `${formatQty(loss)}개${anyUsed && out.quantity > 0 ? ` (${((loss / out.quantity) * 100).toFixed(1)}%)` : ""}`}
                </span>
              </div>
            </div>
          </>
        )}

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
