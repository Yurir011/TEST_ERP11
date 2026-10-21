import type { PaymentAccount } from "./paymentAccounts";

// 시험용 기본 카드·계좌 (서버 마이그레이션이 처음 넣어 두는 값과 같다)
const make = (id: number, kind: "card" | "bank", code: string, nickname: string, extra: Partial<PaymentAccount> = {}): PaymentAccount => ({
  id,
  kind,
  code,
  nickname,
  issuer: nickname,
  last4: null,
  pay_day: kind === "card" ? 15 : null,
  is_active: true,
  in_use: false,
  created_at: "2026-10-21T00:00:00Z",
  ...extra,
});

export const TEST_ACCOUNTS: PaymentAccount[] = [
  make(1, "card", "bc", "BC카드", { pay_day: 23 }),
  make(2, "card", "kb_kookmin", "KB국민카드"),
  make(3, "bank", "ibk", "기업은행"),
  make(4, "bank", "kb_kookmin", "KB국민은행"),
  make(5, "bank", "woori", "우리은행"),
];
