import { KIND_LABELS, formatQty, type Movement } from "./types";

/** 입출고 이력 목록 (최근순). 출고는 사유를, 입고는 메모를 보여 준다. 대표(isAdmin)만 한 줄씩 지울 수 있다. (PC·모바일 공용) */
export function MovementList({ movements, isAdmin, onRemove }: { movements: Movement[]; isAdmin: boolean; onRemove: (movementId: number) => void }) {
  return (
    <ul>
        {movements.map((x) => {
          const out = x.kind === "out";
          return (
            <li key={x.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-2.5 border-b border-border last:border-0 text-sm">
              <span className={`px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${out ? "rounded-md bg-tile-red text-danger" : "rounded-md bg-tile-green text-tile-green-fg"}`}>{KIND_LABELS[x.kind]}</span>
              <span className="min-w-0">
                <span className="tabular-nums">{x.movement_date}</span>
                {out && x.reason && <span className="block text-xs text-text-muted truncate">출고 사유: {x.reason}{x.note ? ` · ${x.note}` : ""}</span>}
                {!out && x.note && <span className="block text-xs text-text-muted truncate">메모: {x.note}</span>}
                {x.created_by_name && <span className="block text-[11px] text-text-muted">{x.created_by_name}</span>}
              </span>
              <b className={`tabular-nums ${out ? "text-danger" : "text-success"}`}>
                {out ? "−" : "+"}
                {formatQty(x.quantity)}
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
