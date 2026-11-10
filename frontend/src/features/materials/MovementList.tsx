import { KIND_LABELS, formatQty, formatReelQty, type Movement } from "./types";

const fmtPct = (loss: number, base: number) => (base > 0 ? `${((loss / base) * 100).toFixed(1)}%` : "0%");

/** 출고 건 정산 타일 (사용 · 반납 · 로스): 사용 개수를 적지 않았으면 0 으로 보인다. 로스만 주황. */
function SettleTiles({ x }: { x: Movement }) {
  const used = x.used_total ?? 0;
  const loss = x.loss_qty ?? 0;
  return (
    <div className="grid grid-cols-3 gap-1.5 mt-2 max-w-sm" aria-label="출고 정산">
      <div className="rounded-lg bg-bg px-2.5 py-1.5 text-[11px] text-text-muted">
        사용<b className="block text-sm text-text tabular-nums">{formatQty(used)}</b>
      </div>
      <div className="rounded-lg bg-bg px-2.5 py-1.5 text-[11px] text-text-muted">
        반납<b className="block text-sm text-text tabular-nums">{formatQty(x.returned_qty ?? 0)}</b>
      </div>
      <div className="rounded-lg bg-tile-orange/60 px-2.5 py-1.5 text-[11px] text-tile-orange-fg">
        로스{x.loss_qty != null ? ` ${fmtPct(loss, x.quantity)}` : ""}
        <b className="block text-sm tabular-nums">{formatQty(loss)}</b>
      </div>
    </div>
  );
}

/** 입출고 이력 목록 (최근순). 출고는 사유를, 입고는 메모를 보여 준다. 대표(isAdmin)만 한 줄씩 지울 수 있다. (PC·모바일 공용) */
export function MovementList({ movements, isAdmin, onRemove }: { movements: Movement[]; isAdmin: boolean; onRemove: (movementId: number) => void }) {
  const byId = new Map(movements.map((x) => [x.id, x]));
  return (
    <ul>
        {movements.map((x) => {
          const out = x.kind === "out";
          const isReturn = x.kind === "return";
          const source = isReturn && x.return_of != null ? byId.get(x.return_of) : undefined;
          return (
            <li key={x.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-2.5 border-b border-border last:border-0 text-sm">
              <span className={`px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${out ? "rounded-md bg-tile-red text-danger" : isReturn ? "rounded-md bg-tile-orange text-tile-orange-fg" : "rounded-md bg-tile-green text-tile-green-fg"}`}>{KIND_LABELS[x.kind]}</span>
              <div className="min-w-0">
                <span className="tabular-nums">{x.movement_date}</span>
                {out && x.reason && <span className="block text-xs text-text-muted truncate">출고 사유: {x.reason}{x.note ? ` · ${x.note}` : ""}</span>}
                {isReturn && source && <span className="block text-xs text-text-muted truncate">{source.movement_date} 출고분 반납{x.used_qty != null ? ` · 사용 ${formatQty(x.used_qty)}개` : ""}</span>}
                {!out && x.note && <span className="block text-xs text-text-muted truncate">메모: {x.note}</span>}
                {x.created_by_name && <span className="block text-[11px] text-text-muted">{x.created_by_name}</span>}
                {out && x.returned_qty != null && <SettleTiles x={x} />}
              </div>
              <b className={`tabular-nums ${out ? "text-danger" : "text-success"}`}>
                {out ? "−" : "+"}
                {formatReelQty(x.quantity, x.reels)}
              </b>
              {isAdmin ? (
                <button type="button" onClick={() => onRemove(x.id)} aria-label="이 기록 지우기" className="text-xs text-text-muted hover:text-danger">
                  지우기
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
    </ul>
  );
}
