import { X } from "lucide-react";
import { formatCurrency } from "../../lib/format";
import { AccountName } from "./AccountName";
import { type CardType, type Payment } from "./types";

interface CardPendingDetailModalProps {
  cardType: CardType;
  items: Payment[];
  periodLabel: string;
  onClose: () => void;
}

// 카드 결제일 전(결제예정)인 법인카드 사용내역을 카드별로 보여준다.
export function CardPendingDetailModal({ cardType, items, periodLabel, onClose }: CardPendingDetailModalProps) {
  const total = items.reduce((sum, p) => sum + p.amount, 0);
  const sorted = [...items].sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.id - a.id);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">
              <AccountName kind="card" code={cardType} /> 결제예정 상세
            </h3>
            <p className="text-xs text-text-muted mt-1">
              {periodLabel} · {items.length}건 · {formatCurrency(total)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text" title="닫기">
            <X size={16} />
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-text-muted">해당 기간에 결제 예정인 사용내역이 없습니다.</p>
        ) : (
          <>
            <ul className="space-y-2 overflow-y-auto">
              {sorted.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 bg-bg rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.description}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      사용일 {p.payment_date} · {p.category}
                      {p.client_name && ` · ${p.client_name}`}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums shrink-0">{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between text-sm font-medium mt-3 px-1">
              <span>합계 {sorted.length}건</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
