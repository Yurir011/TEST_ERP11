import { X } from "lucide-react";
import { NumberInput } from "../../components/ui/NumberInput";
import { formatQty, type QtyPayload } from "./types";

/** 릴 묶음 한 줄: "개수 × 릴 수" (예: 2,500개짜리 릴 2개). */
export interface ReelRow {
  per: string;
  cnt: string;
}

/** 개수 입력 상태. 단위가 개면 qty 만 쓰고, 릴이면 rows("개수 × 릴 수" 줄들)를 쓴다. 릴마다 개수가 다르면 줄을 더한다. */
export interface QtyState {
  unit: "pcs" | "reel";
  qty: string;
  rows: ReelRow[];
}

export const emptyQty = (): QtyState => ({ unit: "pcs", qty: "", rows: [{ per: "", cnt: "" }] });

const rowOk = (r: ReelRow) => (Number(r.per) || 0) > 0 && (Number(r.cnt) || 0) > 0;

/** 총 개수(낱개 기준). 릴이면 줄마다 개수 × 릴 수를 더한다. */
export function qtyTotal(q: QtyState): number {
  return q.unit === "reel" ? q.rows.reduce((s, r) => s + (Number(r.per) || 0) * (Number(r.cnt) || 0), 0) : Number(q.qty) || 0;
}

/** 릴 수 합계 (릴이 아니면 0). */
export function qtyReels(q: QtyState): number {
  return q.unit === "reel" ? q.rows.reduce((s, r) => s + (Number(r.cnt) || 0), 0) : 0;
}

/** 릴인데 개수나 릴 수 중 한쪽만 적은 줄이 있다 (저장 전에 알려야 한다). */
export function qtyIncomplete(q: QtyState): boolean {
  return q.unit === "reel" && q.rows.some((r) => (Number(r.per) > 0) !== (Number(r.cnt) > 0));
}

/** 서버에 보낼 수량. 아직 다 안 적었으면 null. 릴은 비어 있는 줄을 빼고 "개수 × 릴 수" 묶음으로 보낸다. */
export function qtyPayload(q: QtyState): QtyPayload | null {
  if (qtyTotal(q) <= 0 || qtyIncomplete(q)) return null;
  return q.unit === "reel" ? { reel_groups: q.rows.filter(rowOk).map((r) => ({ per_reel: Number(r.per), reels: Number(r.cnt) })) } : { quantity: Number(q.qty) };
}

const inputCls = "rounded-lg border border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary bg-bg";

/**
 * 개수 입력 (등록의 처음 입고, 입고·추가 입고·출고·재입고 공용).
 * 평소에는 개수 한 칸 + [개|릴] 단위 선택이고, 단위를 릴로 고르면 "[개수] 개 × [릴 수] 릴" 한 줄이 나온다.
 * 릴마다 개수가 다르면 [+ 다른 개수 릴 추가]로 줄을 더한다. 총 개수는 "3릴 (7,480개)" 로 함께 보여 준다.
 * @param label 입력칸의 접근성 이름 앞부분 (예: "입고" → "입고 개수")
 */
export function QtyInput({ value, onChange, label, id, className = "" }: { value: QtyState; onChange: (v: QtyState) => void; label: string; id?: string; className?: string }) {
  const isReel = value.unit === "reel";
  const total = qtyTotal(value);
  const reels = qtyReels(value);

  function setRow(i: number, patch: Partial<ReelRow>) {
    onChange({ ...value, rows: value.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {!isReel && <NumberInput id={id} aria-label={`${label} 개수`} value={value.qty} onChange={(v) => onChange({ ...value, qty: v })} placeholder="0" className={`${inputCls} w-28 text-right`} />}
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
        <div className="mt-2 rounded-lg bg-tile-blue/50 px-3 py-2.5 text-sm">
          <p className="text-xs text-text-muted mb-1.5">
            릴 구성 <span className="opacity-70">· 같은 개수의 릴은 한 줄로</span>
          </p>
          <ul className="space-y-1.5">
            {value.rows.map((r, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <NumberInput aria-label={`${label} 릴 ${i + 1} 개수`} value={r.per} onChange={(v) => setRow(i, { per: v })} placeholder="개수" className={`${inputCls} w-24 text-right`} />
                <span className="text-text-muted">개 ×</span>
                <NumberInput aria-label={`${label} 릴 ${i + 1} 릴 수`} value={r.cnt} onChange={(v) => setRow(i, { cnt: v })} placeholder="릴 수" className={`${inputCls} w-20 text-right`} />
                <span className="text-text-muted">릴</span>
                {value.rows.length > 1 && (
                  <button type="button" onClick={() => onChange({ ...value, rows: value.rows.filter((_, k) => k !== i) })} aria-label={`릴 ${i + 1} 줄 지우기`} className="text-text-muted hover:text-text p-1">
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => onChange({ ...value, rows: [...value.rows, { per: "", cnt: "1" }] })} className="mt-2 rounded-lg border border-dashed border-border text-xs text-primary px-2.5 py-1.5">
            + 다른 개수 릴 추가
          </button>
          {total > 0 && (
            <p className="mt-2 pt-2 border-t border-dashed border-border flex justify-between text-xs text-text-muted">
              <span>총</span>
              <b className="text-sm text-primary tabular-nums" aria-label={`${label} 총 개수`}>
                {formatQty(reels)}릴 ({formatQty(total)}개)
              </b>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
