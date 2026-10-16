import { useState, type FormEvent } from "react";
import type { Client } from "../clients/types";
import { remainingAmount, type Transaction } from "../transactions/types";
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
} from "./types";
import { NumberInput } from "../../components/ui/NumberInput";
import { todayISO } from "../../lib/date";

interface SettleModalProps {
  kind: "receivable" | "payable";
  client: Client;
  occurredLabel?: string | null;
  // 월별 보기에서 처리할 때 넘겨받는 그 달의 미결제 매입매출. 있으면 이 내역들을 건별로 결제완료 처리하고, 없으면 거래처 잔액만 줄인다.
  transactions?: Transaction[];
  onClose: () => void;
  onSuccess: () => void;
}

export function SettleModal({ kind, client, occurredLabel, transactions, onClose, onSuccess }: SettleModalProps) {
  const byTransactions = transactions !== undefined && transactions.length > 0;
  const outstanding = byTransactions
    ? transactions.reduce((sum, t) => sum + remainingAmount(t), 0)
    : kind === "receivable"
      ? client.receivable_amount
      : client.payable_amount;
  const title = kind === "receivable" ? "수금 완료 처리" : "지급 완료 처리";
  const actionLabel = kind === "receivable" ? "수금 완료" : "지급 완료";

  const [amount, setAmount] = useState(String(outstanding));
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

    const amountNum = Number(amount) || 0;
    if (amountNum <= 0 && !(byTransactions && outstanding === 0)) {
      setError("금액을 입력해주세요.");
      return;
    }
    if (byTransactions && amountNum > outstanding) {
      setError(`미결제 금액(${formatCurrency(outstanding)})보다 많이 입력할 수 없습니다.`);
      return;
    }
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
      logDebug("Payments", `${actionLabel} 처리 시도: client_id=${client.id}, amount=${amountNum}, 건별=${byTransactions}`);
      if (byTransactions) {
        // 선택한 달에 발생한 미결제 매입매출에 입력한 금액을 오래된 건부터 차례로 배분한다 (건마다 입출금 내역이 하나씩 기록된다).
        // 건의 미결제 금액을 다 채우면 결제완료, 모자라면 그 건은 일부만 수금/지급한 상태(부분 결제)로 남는다.
        const ordered = [...transactions!].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || a.id - b.id);
        let left = amountNum;
        for (const t of ordered) {
          const due = remainingAmount(t);
          const pay = Math.min(due, left);
          // 금액이 0원인 건은 전액을 처리할 때만 함께 결제완료로 바꾼다.
          if (pay <= 0 && !(due === 0 && amountNum === outstanding)) continue;
          left -= pay;
          await apiPost<Payment>("/api/payments", {
            type: kind === "receivable" ? "deposit" : "withdrawal",
            payment_date: paymentDate,
            category: kind === "receivable" ? "외상매출금" : "미지급금",
            description: `${t.item_name} ${kind === "receivable" ? "수금" : "지급"}${pay < due ? "(일부)" : ""}`,
            amount: pay,
            method,
            client_id: client.id,
            memo: memo || null,
            proof_type: null,
            proof_type_detail: null,
            card_type: method === "corporate_card" ? cardType : null,
            bank_type: method === "bank_transfer" ? bankType : null,
            transaction_id: t.id,
          });
        }
        onSuccess();
        return;
      }
      await apiPost<Payment>("/api/payments", {
        type: kind === "receivable" ? "deposit" : "withdrawal",
        payment_date: paymentDate,
        category: kind === "receivable" ? "외상매출금" : "미지급금",
        description: `${kind === "receivable" ? "미수금" : "미지급금"} ${kind === "receivable" ? "수금" : "지급"}${amountNum < outstanding ? "(일부)" : ""}`,
        amount: amountNum,
        method,
        client_id: client.id,
        // 거래처 잔액만 줄이는 처리라 연결된 매입매출이 없으므로, 발생일은 메모에 남겨 상세에서 볼 수 있게 한다.
        memo: [occurredLabel ? `발생일 ${occurredLabel}` : "", memo].filter(Boolean).join(" / ") || null,
        proof_type: null,
        proof_type_detail: null,
        card_type: method === "corporate_card" ? cardType : null,
        bank_type: method === "bank_transfer" ? bankType : null,
      });
      onSuccess();
    } catch (err) {
      logError("Payments", `${actionLabel} 처리 실패`, err);
      setError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <form onSubmit={handleSubmit} className="bg-surface rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-sm font-semibold mb-1">{title}</h3>
        <p className="text-xs text-text-muted mb-4">
          {client.name} · {kind === "receivable" ? "미수금" : "미지급금"} {formatCurrency(outstanding)}
          {occurredLabel && ` · 발생일 ${occurredLabel}`}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">금액</label>
            <NumberInput
              required={!(byTransactions && outstanding === 0)}
              value={amount}
              onChange={setAmount}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
            {byTransactions && (
              <p className="text-xs text-text-muted mt-1.5">
                미결제 {transactions!.length}건 · 일부만 {kind === "receivable" ? "수금" : "지급"}하면 오래된 건부터 차례로 처리합니다.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">날짜</label>
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
                      cardType === ct
                        ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                        : "border-border text-text-muted hover:bg-bg"
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
                      bankType === bt
                        ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                        : "border-border text-text-muted hover:bg-bg"
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
            {isSubmitting ? "처리 중..." : actionLabel}
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
