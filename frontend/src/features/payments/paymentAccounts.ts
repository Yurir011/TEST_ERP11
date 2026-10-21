import { useEffect, useSyncExternalStore } from "react";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";

// 법인카드·계좌 목록(카드·계좌 관리). 입출금·정기 지출·품의서 결제 화면에서 고르는 수단이자, 옛 내역의 이름을 보여 주는 기준이다.

export type AccountKind = "card" | "bank";

export interface PaymentAccount {
  id: number;
  kind: AccountKind;
  code: string; // 입출금에 저장되는 값 (옛 값 bc, kb_kookmin, ibk, woori 도 그대로)
  nickname: string; // 평소 화면에 보이는 이름(별명)
  issuer: string; // 카드사 / 은행
  last4: string | null; // 뒤 4자리 (눌러서 확인)
  pay_day: number | null; // 카드 결제일
  is_active: boolean; // 숨김 처리(false)된 수단은 새로 고를 수 없지만 옛 내역의 이름은 그대로 보인다
  in_use: boolean;
  created_at: string;
}

let accounts: PaymentAccount[] | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** 목록을 서버에서 다시 받는다 (카드·계좌를 추가·수정·삭제한 뒤). 숨긴 수단도 받아 옛 내역의 이름을 보여 준다. */
export function refreshPaymentAccounts(): Promise<void> {
  logDebug("PaymentAccounts", "카드·계좌 목록 조회");
  inflight = apiGet<PaymentAccount[]>("/api/payment-accounts?include_inactive=true")
    .then((list) => {
      accounts = list;
      emit();
    })
    .catch((err) => logError("PaymentAccounts", "카드·계좌 목록 조회 실패", err))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 시험용: 저장된 목록을 비운다 */
export function resetPaymentAccountsForTest(next: PaymentAccount[] | null = null) {
  accounts = next;
  inflight = null;
  emit();
}

export const nameOf = (list: PaymentAccount[], kind: AccountKind, code: string | null | undefined): string => {
  if (!code) return "";
  return list.find((a) => a.kind === kind && a.code === code)?.nickname ?? code;
};

/** 화면 바깥(함수)에서 이름이 필요할 때 지금 받아 둔 목록에서 찾는다. 목록이 아직 없으면 code 를 그대로 돌려준다. (화면에서는 usePaymentAccounts 로 다시 그리게 한다) */
export const accountNameNow = (kind: AccountKind, code: string | null | undefined): string => nameOf(accounts ?? [], kind, code);

export interface PaymentAccountsView {
  /** 숨긴 수단까지 모두 (이름 찾기용) */
  all: PaymentAccount[];
  /** 새로 고를 수 있는 카드 / 계좌 */
  cards: PaymentAccount[];
  banks: PaymentAccount[];
  cardName: (code: string | null | undefined) => string;
  bankName: (code: string | null | undefined) => string;
  loaded: boolean;
}

export function usePaymentAccounts(): PaymentAccountsView {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => accounts,
  );
  useEffect(() => {
    if (accounts === null && inflight === null) void refreshPaymentAccounts();
  }, []);
  const all = list ?? [];
  return {
    all,
    cards: all.filter((a) => a.kind === "card" && a.is_active),
    banks: all.filter((a) => a.kind === "bank" && a.is_active),
    cardName: (code) => nameOf(all, "card", code),
    bankName: (code) => nameOf(all, "bank", code),
    loaded: list !== null,
  };
}
