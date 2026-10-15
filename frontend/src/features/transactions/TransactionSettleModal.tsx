import { useState, type FormEvent } from "react";
import { ApiError, apiPost } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import {
  BANK_TYPE_LABELS,
  CARD_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type BankType,
  type CardType,
  type Payment,
  type PaymentMethod,
} from "../payments/types";
import type { Transaction } from "./types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

interface TransactionSettleModalProps {
  tx: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}

// 외상 매출/매입 1건을 결제완료로 처리한다. 입출금 내역이 함께 기록되고, 거래처 미수금/미지급금에서 해당 금액이 빠진다.
export function TransactionSettleModal({ tx, onClose, onSuccess }: TransactionSettleModalProps) {
  const isSales = tx.type === "sales";
  const title = isSales ? "수금 처리" : "지급 처리";

  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [cardType, setCardType] = useState<CardType | null>(null);
  const [bankType, setBankType] = useState<BankType | null>("ibk");
  const [memo, setMemo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (method === "corporate_card" && !cardType) {
      setError("카드 종류를 선택해주세요.");
      return;
    }
    if (method === "bank_transfer" && !bankType) {
      setError("계좌 종류를 선택해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      logDebug("Transactions", `${title} 시도: tx_id=${tx.id}, amount=${tx.total_amount}, method=${method}`);
      await apiPost<Payment>("/api/payments", {
        type: isSales ? "deposit" : "withdrawal",
        payment_date: paymentDate,
        category: isSales ? "외상매출금" : "외상매입금",
        description: `${tx.item_name} ${isSales ? "수금" : "지급"}`,
        amount: tx.total_amount,
        method,
        client_id: tx.client_id,
        memo: memo.trim() || null,
        proof_type: null,
        proof_type_detail: null,
        card_type: method === "corporate_card" ? cardType : null,
        bank_type: method === "bank_transfer" ? bankType : null,
        transaction_id: tx.id,
      });
      logDebug("Transactions", `${title} 성공: tx_id=${tx.id}`);
      onSuccess();
    } catch (err) {
      logError("Transactions", `${title} 실패`, err);
      setError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] px-4">
      <form onSubmit={handleSubmit} className="bg-surface rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-sm font-semibold mb-1">{title}</h3>
        <p className="text-xs text-text-muted mb-4">
          {tx.client_name ?? tx.counterparty ?? "-"} · {tx.item_name} · {formatCurrency(tx.total_amount)}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">금액</label>
            <p className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-bg tabular-nums">{formatCurrency(tx.total_amount)}</p>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">{isSales ? "입금일" : "지급일"}</label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">결제수단</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          {method === "corporate_card" && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5">카드 종류</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(CARD_TYPE_LABELS) as CardType[]).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setCardType(ct)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      cardType === ct ? "border-primary bg-tile-blue text-tile-blue-fg font-medium" : "border-border text-text-muted hover:bg-bg"
                    }`}
                  >
                    {CARD_TYPE_LABELS[ct]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {method === "bank_transfer" && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5">계좌 종류</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(BANK_TYPE_LABELS) as BankType[]).map((bt) => (
                  <button
                    key={bt}
                    type="button"
                    onClick={() => setBankType(bt)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      bankType === bt ? "border-primary bg-tile-blue text-tile-blue-fg font-medium" : "border-border text-text-muted hover:bg-bg"
                    }`}
                  >
                    {BANK_TYPE_LABELS[bt]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-text-muted mb-1.5">메모</label>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y"
            />
          </div>
        </div>

        {error && <p className="text-xs text-danger mt-3">{error}</p>}

        <div className="flex items-center gap-2 mt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? "처리 중..." : title}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
