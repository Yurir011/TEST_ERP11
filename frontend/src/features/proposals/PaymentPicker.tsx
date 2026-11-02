import { accountNameNow, usePaymentAccounts } from "../payments/paymentAccounts";
import type { Proposal } from "./types";

/** 대금 결제 상태: 송금(계좌) / 법인카드(카드 종류) / 둘 다 아니면 외상(아직 결제하지 않음) */
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
    ? `송금${p.payment_bank ? ` (${accountNameNow("bank", p.payment_bank)})` : ""}`
    : p.payment_method === "card"
      ? `법인카드${p.payment_card ? ` (${accountNameNow("card", p.payment_card)})` : ""}`
      : "외상";

type PayChoice = "deposit" | "card" | "credit";

/**
 * 결제 방법: 송금 / 법인카드 / 외상 중 하나를 가로 체크박스로 고르고, 송금·법인카드를 고르면 아래에 세부 항목(계좌·카드 종류)이 나온다.
 * 외상은 아직 결제하지 않은 상태다. 셋은 함께 고를 수 없다.
 */
export function PaymentPicker({ value, onChange }: { value: OrderPayment; onChange: (v: OrderPayment) => void }) {
  const { cards, banks } = usePaymentAccounts();
  const current: PayChoice = value.payment_method ?? "credit";

  function choose(next: PayChoice) {
    if (next === "deposit") onChange({ payment_method: "deposit", payment_card: null, payment_bank: banks[0]?.code ?? null });
    else if (next === "card") onChange({ payment_method: "card", payment_card: cards[0]?.code ?? null, payment_bank: null });
    else onChange(NO_PAYMENT);
  }

  const options: { key: PayChoice; label: string }[] = [
    { key: "deposit", label: "송금" },
    { key: "card", label: "법인카드" },
    { key: "credit", label: "외상" },
  ];
  const selectCls = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary";

  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2" role="group" aria-label="결제 방법">
        {options.map((o) => (
          <label key={o.key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={current === o.key}
              onChange={() => choose(o.key)}
              className="w-4 h-4 accent-primary"
            />
            {o.label}
          </label>
        ))}
      </div>
      {current === "deposit" && (
        <label className="flex items-center gap-2 text-text-muted">
          계좌
          <select
            aria-label="송금 계좌"
            value={value.payment_bank ?? banks[0]?.code ?? ""}
            onChange={(e) => onChange({ payment_method: "deposit", payment_card: null, payment_bank: e.target.value })}
            className={`${selectCls} text-text`}
          >
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.nickname}
              </option>
            ))}
          </select>
        </label>
      )}
      {current === "card" && (
        <label className="flex items-center gap-2 text-text-muted">
          카드
          <select
            aria-label="법인카드 종류"
            value={value.payment_card ?? cards[0]?.code ?? ""}
            onChange={(e) => onChange({ payment_method: "card", payment_card: e.target.value, payment_bank: null })}
            className={`${selectCls} text-text`}
          >
            {cards.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nickname}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
