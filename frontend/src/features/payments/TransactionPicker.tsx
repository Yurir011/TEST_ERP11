import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, apiGet } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { PAYMENT_TYPE_STYLES, type PaymentTransactionCandidate } from "./types";

/** 입출금 등록 화면의 "매입매출 불러오기 (외상)" 창: 아직 결제되지 않은 외상 매출/매입을 검색해 고른다. */
export function TransactionPicker({ onPick, onClose }: { onPick: (c: PaymentTransactionCandidate) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PaymentTransactionCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      logDebug("PaymentForm", `불러올 외상 매입매출 조회: q=${q}`);
      apiGet<PaymentTransactionCandidate[]>(`/api/payments/linkable-transactions?q=${encodeURIComponent(q)}`)
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch((err) => {
          logError("PaymentForm", "외상 매입매출 목록 조회 실패", err);
          setError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">매입매출 불러오기 (외상)</h3>
          <button onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">
          아직 결제되지 않은 외상매출/외상매입만 보입니다. 선택해 저장하면 해당 내역이 매입매출관리에서 결제완료로 바뀌고, 입출금 날짜가 완료일로 기록됩니다.
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="거래처/품목 검색"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg mb-3"
        />
        {error && <p className="text-xs text-danger mb-2">{error}</p>}
        {rows !== null && rows.length === 0 && <p className="text-sm text-text-muted py-6 text-center">결제할 외상 내역이 없습니다.</p>}
        {rows !== null && rows.length > 0 && (
          <div className="border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-xs min-w-[520px]">
              <thead className="bg-bg text-text-muted">
                <tr className="text-left">
                  <th className="py-2 px-3 font-medium">구분</th>
                  <th className="py-2 px-3 font-medium">거래일</th>
                  <th className="py-2 px-3 font-medium">거래처</th>
                  <th className="py-2 px-3 font-medium">품목</th>
                  <th className="py-2 px-3 font-medium text-right">합계금액</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => onPick(r)} className="border-t border-border cursor-pointer hover:bg-bg">
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 font-medium ${PAYMENT_TYPE_STYLES[r.type]}`}>
                        {r.type === "deposit" ? "외상매출" : "외상매입"}
                      </span>
                    </td>
                    <td className="py-2 px-3 tabular-nums">{r.transaction_date}</td>
                    <td className="py-2 px-3">{r.client_name}</td>
                    <td className="py-2 px-3 max-w-[200px] truncate">{r.item_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
