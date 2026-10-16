import type { Client } from "../clients/types";
import { remainingAmount, type Transaction } from "../transactions/types";

// 미수금/미지급금 현황 계산 (화면과 분리한 순수 함수).
export type OutstandingKind = "receivable" | "payable";
export type OutstandingPeriod = "all" | "month";

export interface OutstandingRow {
  client: Client;
  amount: number;
}

const txTypeOf = (kind: OutstandingKind) => (kind === "receivable" ? "sales" : "purchase");

/**
 * 거래처별 미수금(또는 미지급금) 행 목록.
 * - 전체(all): 미결제 매입매출 건이 있으면 그 남은 금액 합계를 기준으로 삼는다 (월별 보기와 같은 기준이라 전체가 항상 월별 이상이 된다).
 *   거래처 잔액이 그보다 크면(건과 무관하게 잔액만 있는 경우) 잔액을 쓴다. 건이 없는 거래처는 잔액이 0보다 클 때만 표시한다.
 * - 월별(month): 선택한 달에 발생한 미결제 건의 남은 금액 합계.
 */
export function buildOutstandingRows(
  kind: OutstandingKind,
  period: OutstandingPeriod,
  clients: Client[],
  unsettledTx: Transaction[],
  periodTx: Transaction[] | null
): OutstandingRow[] {
  const txType = txTypeOf(kind);
  if (period === "all") {
    const remainingByClient = new Map<number, number>();
    unsettledTx.forEach((t) => {
      if (t.type === txType && t.client_id !== null) {
        remainingByClient.set(t.client_id, (remainingByClient.get(t.client_id) ?? 0) + remainingAmount(t));
      }
    });
    return clients
      .map((client) => {
        const balance = kind === "receivable" ? client.receivable_amount : client.payable_amount;
        return { client, amount: Math.max(balance, remainingByClient.get(client.id) ?? 0), hasTx: remainingByClient.has(client.id) };
      })
      .filter((r) => r.amount > 0 || r.hasTx)
      .map(({ client, amount }) => ({ client, amount }));
  }
  const byClient = new Map<number, number>();
  (periodTx ?? []).forEach((t) => {
    if (t.type === txType && t.client_id !== null) byClient.set(t.client_id, (byClient.get(t.client_id) ?? 0) + remainingAmount(t));
  });
  return clients.filter((c) => byClient.has(c.id)).map((client) => ({ client, amount: byClient.get(client.id) ?? 0 }));
}

/** 거래처별 미수금/미지급금 발생일(미결제 매출·매입의 거래일). 여러 건이면 가장 이른(최초) 발생일. */
export function occurredLabel(kind: OutstandingKind, clientId: number, unsettledTx: Transaction[]): string | null {
  const txType = txTypeOf(kind);
  const dates = unsettledTx
    .filter((t) => t.type === txType && t.client_id === clientId)
    .map((t) => t.transaction_date)
    .sort();
  return dates.length === 0 ? null : dates[0];
}

/** 일부만 수금/지급한 거래처의 가장 최근 부분 결제일. */
export function partialPaidLabel(kind: OutstandingKind, clientId: number, unsettledTx: Transaction[]): string | null {
  const txType = txTypeOf(kind);
  const dates = unsettledTx
    .filter((t) => t.type === txType && t.client_id === clientId)
    .flatMap((t) => t.payment_history.map((p) => p.payment_date))
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}
