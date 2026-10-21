import { accountNameNow, usePaymentAccounts } from "../payments/paymentAccounts";
import type { Proposal } from "./types";

/** 대금 결제 상태: 입금(계좌) / 법인카드(카드 종류) / 둘 다 아니면 외상(아직 결제하지 않음) */
export interface OrderPayment {
  payment_method: "deposit" | "card" | null;
  payment_card: string | null; // 카드·계좌 관리의 카드 code
  payment_bank: string | null; // 카드·계좌 관리의 계좌 code
}

export const NO_PAYMENT: OrderPayment = { payment_method: null, payment_card: null, payment_bank: null };

export const paymentFromProposal = (p: Pick<Proposal, "payment_method" | "payment_card" | "payment_bank">): OrderPayment => ({
  payment_method: p.payment_method ?? null,
  payment_card: p.payment_card ?? null,
  payment_bank: p.payment_bank ?? null,
});

export const paymentLabel = (p: Partial<OrderPayment>): string =>
  p.payment_method === "deposit"
    ? `입금${p.payment_bank ? ` (${accountNameNow("bank", p.payment_bank)})` : ""}`
    : p.payment_method === "card"
      ? `법인카드${p.payment_card ? ` (${accountNameNow("card", p.payment_card)})` : ""}`
      : "외상";

/**
 * 입금 체크(체크하면 계좌 선택) + 법인카드 선택. 아무것도 고르지 않으면 외상으로 처리된다.
 * 입금과 법인카드는 함께 고를 수 없다.
 */
export function PaymentPicker({ value, onChange }: { value: OrderPayment; onChange: (v: OrderPayment) => void }) {
  const { cards, banks } = usePaymentAccounts();
  const firstBank = banks[0]?.code ?? null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.payment_method === "deposit"}
            onChange={(e) => onChange(e.target.checked ? { payment_method: "deposit", payment_card: null, payment_bank: firstBank } : NO_PAYMENT)}
            className="w-4 h-4 accent-primary"
          />
          입금
        </label>
        {value.payment_method === "deposit" && (
          <select
            aria-label="입금 계좌"
            value={value.payment_bank ?? firstBank ?? ""}
            onChange={(e) => onChange({ payment_method: "deposit", payment_card: null, payment_bank: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
          >
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.nickname}
              </option>
            ))}
          </select>
        )}
      </div>
      <label className="flex items-center gap-2">
        법인카드
        <select
          aria-label="법인카드"
          value={value.payment_method === "card" ? (value.payment_card ?? "") : ""}
          onChange={(e) => {
            const card = e.target.value;
            onChange(card ? { payment_method: "card", payment_card: card, payment_bank: null } : NO_PAYMENT);
          }}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">선택 안 함</option>
          {cards.map((c) => (
            <option key={c.code} value={c.code}>
              {c.nickname}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
