import { formatCurrency } from "../../lib/format";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "../payments/types";
import { remainingAmount, type Transaction } from "./types";

// 부분 수금/지급 내역(일자·금액·결제수단)과 남은 금액을 보여준다. 부분 결제가 없으면 아무것도 그리지 않는다.
export function PaymentHistoryList({ tx }: { tx: Transaction }) {
  if (!tx.payment_history || tx.payment_history.length === 0) return null;
  const verb = tx.type === "sales" ? "수금" : "지급";
  return (
    <div className="mt-2 rounded-lg bg-surface border border-border px-3 py-2">
      <p className="text-[11px] font-medium text-text-muted mb-1">
        부분 {verb} 내역 · 총 {formatCurrency(tx.total_amount)} 중 {formatCurrency(tx.paid_amount)} {verb}
      </p>
      <ul className="space-y-0.5">
        {tx.payment_history.map((p) => (
          <li key={p.id} className="flex justify-between gap-3 text-xs tabular-nums">
            <span className="text-text-muted">
              {p.payment_date} · {PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}
            </span>
            <span>{formatCurrency(p.amount)}</span>
          </li>
        ))}
      </ul>
      {!tx.settled && (
        <p className="flex justify-between text-xs font-medium mt-1 pt-1 border-t border-border tabular-nums">
          <span>남은 금액</span>
          <span>{formatCurrency(remainingAmount(tx))}</span>
        </p>
      )}
    </div>
  );
}
