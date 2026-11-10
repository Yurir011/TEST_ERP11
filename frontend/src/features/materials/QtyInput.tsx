import { NumberInput } from "../../components/ui/NumberInput";
import { formatQty, type QtyPayload } from "./types";

/** 개수 입력 상태. 단위가 개면 qty 만 쓰고, 릴이면 reels(릴 수)와 perReel(1릴 당 개수)을 쓴다. */
export interface QtyState {
  unit: "pcs" | "reel";
  qty: string;
  reels: string;
  perReel: string;
}

export const emptyQty = (): QtyState => ({ unit: "pcs", qty: "", reels: "", perReel: "" });

/** 총 개수(낱개 기준). 릴이면 릴 수 × 1릴 당 개수. */
export function qtyTotal(q: QtyState): number {
  return q.unit === "reel" ? (Number(q.reels) || 0) * (Number(q.perReel) || 0) : Number(q.qty) || 0;
}

/** 서버에 보낼 수량. 아직 다 안 적었으면 null. */
export function qtyPayload(q: QtyState): QtyPayload | null {
  if (qtyTotal(q) <= 0) return null;
  return q.unit === "reel" ? { reels: Number(q.reels), per_reel: Number(q.perReel) } : { quantity: Number(q.qty) };
}

const inputCls = "rounded-lg border border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary bg-bg";

/**
 * 개수 입력 (등록의 처음 입고, 입고·추가 입고·출고 공용).
 * 평소에는 개수 한 칸 + [개|릴] 단위 선택이고, 단위를 릴로 고를 때만 "1릴 당 [ ]개" 칸이 나온다. 릴이면 곱한 총 개수를 옆에 "3릴 (7,500개)" 로 보여 준다.
 * @param label 입력칸의 접근성 이름 앞부분 (예: "입고" → "입고 개수")
 */
export function QtyInput({ value, onChange, label, id, className = "" }: { value: QtyState; onChange: (v: QtyState) => void; label: string; id?: string; className?: string }) {
  const isReel = value.unit === "reel";
  const total = qtyTotal(value);
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {isReel ? (
          <NumberInput id={id} aria-label={`${label} 릴 수`} value={value.reels} onChange={(v) => onChange({ ...value, reels: v })} placeholder="릴 수" className={`${inputCls} w-28 text-right`} />
        ) : (
          <NumberInput id={id} aria-label={`${label} 개수`} value={value.qty} onChange={(v) => onChange({ ...value, qty: v })} placeholder="0" className={`${inputCls} w-28 text-right`} />
        )}
        <div className="inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label={`${label} 단위`}>
          {(["pcs", "reel"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={value.unit === u}
              onClick={() => onChange({ ...value, unit: u })}
              className={`px-3.5 py-2.5 text-base sm:text-sm ${value.unit === u ? "bg-primary text-white font-semibold" : "bg-bg text-text hover:bg-surface"} ${u === "reel" ? "border-l border-border" : ""}`}
            >
              {u === "pcs" ? "개" : "릴"}
            </button>
          ))}
        </div>
      </div>
      {isReel && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-tile-blue/50 px-3 py-2.5 text-sm">
          <span className="text-text-muted">1릴 당</span>
          <NumberInput aria-label={`${label} 1릴 당 개수`} value={value.perReel} onChange={(v) => onChange({ ...value, perReel: v })} placeholder="개수" className={`${inputCls} w-28 text-right`} />
          <span className="text-text-muted">개</span>
          {total > 0 && (
            <b className="ml-auto text-primary tabular-nums" aria-label={`${label} 총 개수`}>
              {formatQty(Number(value.reels))}릴 ({formatQty(total)}개)
            </b>
          )}
        </div>
      )}
    </div>
  );
}
