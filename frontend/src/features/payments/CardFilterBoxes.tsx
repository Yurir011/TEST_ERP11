import { formatCurrency } from "../../lib/format";
import { usePaymentAccounts } from "./paymentAccounts";
import { type CardType, type Payment } from "./types";

export type CardFilter = "all" | CardType;

interface CardFilterBoxesProps {
  /** 카드 탭에서 조회된 전체 카드 내역 (요약 숫자는 선택과 상관없이 이 전체 기준) */
  rows: Payment[];
  value: CardFilter;
  onChange: (value: CardFilter) => void;
}

// 카드 탭 상단의 카드 종류별 요약 상자. 누르면 그 카드 내역만 표에 나온다.
export function CardFilterBoxes({ rows, value, onChange }: CardFilterBoxesProps) {
  const { all } = usePaymentAccounts();
  // 지금 쓰는 카드와, 숨겼더라도 내역이 남아 있는 카드를 보여 준다
  const cardCodes = all.filter((a) => a.kind === "card" && (a.is_active || rows.some((p) => p.card_type === a.code)));
  const boxes: { key: CardFilter; label: string; rows: Payment[] }[] = [
    { key: "all", label: "전체 카드", rows },
    ...cardCodes.map((c) => ({
      key: c.code as CardType,
      label: c.nickname,
      rows: rows.filter((p) => p.card_type === c.code),
    })),
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 mb-4">
      {boxes.map((box) => (
        <button
          key={box.key}
          type="button"
          onClick={() => onChange(box.key)}
          className={`flex items-baseline justify-between gap-3 text-left rounded-xl border px-4 py-2.5 transition-colors ${
            value === box.key ? "border-primary bg-tile-blue" : "border-border bg-surface hover:border-primary/40"
          }`}
        >
          <span className="text-sm min-w-0 truncate">
            {box.label} <span className="text-xs text-text-muted">· {box.rows.length}건</span>
          </span>
          <span className="text-base font-semibold tabular-nums shrink-0">
            {formatCurrency(box.rows.reduce((sum, p) => sum + p.amount, 0))}
          </span>
        </button>
      ))}
    </div>
  );
}
