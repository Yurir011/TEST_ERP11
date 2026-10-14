import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Client } from "../clients/types";
import { apiGet } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { Transaction } from "../transactions/types";

interface OutstandingDetailModalProps {
  kind: "receivable" | "payable";
  client: Client;
  onClose: () => void;
  onSettle: () => void;
}

// 미수금(매출)/미지급금(매입) 잔액을 이루는 미결제 매입매출 내역을 보여준다.
export function OutstandingDetailModal({ kind, client, onClose, onSettle }:OutstandingDetailModalProps) {
  const label = kind === "receivable" ? "미수금" : "미지급금";
  const settleLabel = kind === "receivable" ? "수금완료" : "지급완료";
  const txType =kind === "receivable" ? "sales" : "purchase";
  const outstanding = kind === "receivable" ? client.receivable_amount : client.payable_amount;

  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    logDebug("Payments", `${label} 상세 조회 시작: client_id=${client.id}`);
    apiGet<Transaction[]>(`/api/transactions?type=${txType}&settled=false`)
      .then((list) => {
        const mine = list.filter((t) => t.client_id === client.id);
        logDebug("Payments", `${label} 상세 조회 성공: ${mine.length}건`);
        setItems(mine);
      })
      .catch((err) => {
        logError("Payments", `${label} 상세 조회 실패`, err);
        setError("상세 내역을 불러오지 못했습니다.");
      });
  }, [client.id, txType, label]);

  const listTotal = (items ?? []).reduce((sum, t) => sum + t.total_amount, 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">{client.name} {label} 상세</h3>
            <p className="text-xs text-text-muted mt-1">{label} 잔액 {formatCurrency(outstanding)}</p>
          </div>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text" title="닫기">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {!error && items === null && <p className="text-xs text-text-muted">불러오는 중...</p>}
        {items !== null && items.length === 0 && (
          <p className="text-sm text-text-muted">연결된 미결제 {kind === "receivable" ? "매출" : "매입"} 내역이 없습니다.</p>
        )}
        {items !== null && items.length > 0 && (
          <>
            <ul className="space-y-2 overflow-y-auto">
              {items.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 bg-bg rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.item_name}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {t.transaction_date}
                      {t.tax_invoice_no && ` · 계산서 ${t.tax_invoice_no}`}
                      {t.memo && ` · ${t.memo}`}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums shrink-0">{formatCurrency(t.total_amount)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between text-sm font-medium mt-3 px-1">
              <span>합계 {items.length}건</span>
              <span className="tabular-nums">{formatCurrency(listTotal)}</span>
            </p>
          </>
        )}

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => {
              logDebug("Payments", `${label} 상세에서 ${settleLabel} 클릭: client_id=${client.id}`);
              onSettle();
            }}
            className={
              kind === "receivable"
                ? "text-sm text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-tile-blue"
                : "text-sm text-danger border border-danger/30 rounded-lg px-4 py-2 hover:bg-red-50"
            }
          >
            {settleLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
