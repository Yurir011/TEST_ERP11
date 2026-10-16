import { Pencil, X } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../lib/format";
import { logDebug } from "../../lib/logger";
import { PaymentHistoryList } from "./PaymentHistoryList";
import { TX_TYPE_LABELS, TX_TYPE_STYLES, type Transaction } from "./types";
import { SOFT_BADGE } from "../../components/ui/softBadge";

interface TransactionDetailModalProps {
  tx: Transaction;
  onClose: () => void;
  onSettle: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0 text-sm">
      <span className="text-text-muted shrink-0">{label}</span>
      <span className="text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

// 매입매출 한 건의 세부 내용을 보여주고, 아직 결제되지 않은 건은 여기서 바로 수금/지급 처리할 수 있다.
export function TransactionDetailModal({ tx, onClose, onSettle }: TransactionDetailModalProps) {
  const settleLabel = tx.type === "sales" ? "수금 처리" : "지급 처리";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 font-medium ${TX_TYPE_STYLES[tx.type]}`}>{TX_TYPE_LABELS[tx.type]}</span>
            <h3 className="text-sm font-semibold">{tx.item_name}</h3>
          </div>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text" title="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="mb-4">
          <Row label="거래일">{tx.transaction_date}</Row>
          <Row label="거래처">{tx.client_name ?? tx.counterparty ?? "-"}</Row>
          <Row label="공급가액">{formatCurrency(tx.supply_amount)}</Row>
          <Row label="부가세">{formatCurrency(tx.vat_amount)}</Row>
          <Row label="합계">
            <b>{formatCurrency(tx.total_amount)}</b>
          </Row>
          <Row label="세금계산서 번호">{tx.tax_invoice_no ?? "-"}</Row>
          <Row label="결제 상태">
            {tx.settled ? (
              <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.green}`}>
                {tx.type === "sales" ? "입금완료" : "결제완료"}
                {tx.settled_date ? ` ${tx.settled_date}` : ""}
              </span>
            ) : (
              <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.orange}`}>{tx.type === "sales" ? "외상매출" : "외상매입"}{tx.paid_amount > 0 ? (tx.type === "sales" ? " · 수금(일부)" : " · 지급(일부)") : ""}</span>
            )}
          </Row>
          {tx.memo && <Row label="메모">{tx.memo}</Row>}
          <PaymentHistoryList tx={tx} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/transactions/${tx.id}/edit`}
            onClick={() => logDebug("Transactions", `상세에서 수정 이동: tx_id=${tx.id}`)}
            className="flex items-center gap-1.5 text-xs text-text-muted border border-border rounded-lg px-3 py-1.5 hover:bg-bg"
          >
            <Pencil size={13} />
            수정
          </Link>
          {!tx.settled && (
            <button
              type="button"
              onClick={() => {
                logDebug("Transactions", `상세에서 ${settleLabel} 클릭: tx_id=${tx.id}`);
                onSettle();
              }}
              className={`text-xs font-medium border bg-surface rounded-full px-3.5 py-1.5 transition-colors ${
                tx.type === "sales"
                  ? "text-primary border-primary/30 hover:bg-tile-blue"
                  : "text-danger border-danger/30 hover:bg-red-50"
              }`}
            >
              {settleLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
