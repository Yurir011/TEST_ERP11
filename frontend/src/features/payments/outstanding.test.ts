import { describe, expect, it } from "vitest";
import type { Client } from "../clients/types";
import type { Transaction } from "../transactions/types";
import { buildOutstandingRows, occurredLabel, partialPaidLabel } from "./outstanding";

const client = (id: number, receivable = 0, payable = 0): Client => ({ id, name: `거래처${id}`, receivable_amount: receivable, payable_amount: payable }) as Client;

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: 1,
    type: "sales",
    transaction_date: "2026-10-01",
    client_id: 1,
    total_amount: 1_000,
    paid_amount: 0,
    settled: false,
    payment_history: [],
    ...over,
  }) as Transaction;

describe("buildOutstandingRows — 전체(all)", () => {
  it("잔액이 있는 거래처를 보여주고, 잔액 0 · 건 없음은 숨긴다", () => {
    const rows = buildOutstandingRows("receivable", "all", [client(1, 500), client(2, 0)], [], null);
    expect(rows.map((r) => r.client.id)).toEqual([1]);
    expect(rows[0].amount).toBe(500);
  });

  it("미결제 건이 있으면 잔액이 0이어도 보여준다 (금액 0원 건 포함)", () => {
    const rows = buildOutstandingRows("receivable", "all", [client(1, 0)], [tx({ total_amount: 0 })], null);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(0);
  });

  it("금액은 거래처 잔액과 미결제 건 남은 금액 중 큰 값", () => {
    // 잔액은 0으로 어긋나 있지만 건에는 4만원이 남은 경우 (부분 결제 이전 입력 때문에 생기는 어긋남)
    const unsettled = [tx({ type: "purchase", total_amount: 550_000, paid_amount: 510_000 })];
    const rows = buildOutstandingRows("payable", "all", [client(1, 0, 0)], unsettled, null);
    expect(rows[0].amount).toBe(40_000);

    const rows2 = buildOutstandingRows("receivable", "all", [client(1, 900)], [tx({ total_amount: 500 })], null);
    expect(rows2[0].amount).toBe(900); // 잔액이 더 크면 잔액
  });

  it("미수금은 매출만, 미지급금은 매입만 센다", () => {
    const unsettled = [tx({ type: "sales", total_amount: 100 }), tx({ id: 2, type: "purchase", total_amount: 300 })];
    expect(buildOutstandingRows("receivable", "all", [client(1)], unsettled, null)[0].amount).toBe(100);
    expect(buildOutstandingRows("payable", "all", [client(1)], unsettled, null)[0].amount).toBe(300);
  });

  it("전체 금액은 월별 금액 이상이다", () => {
    const monthTx = [tx({ total_amount: 700, paid_amount: 200 })];
    const month = buildOutstandingRows("receivable", "month", [client(1, 500)], [], monthTx);
    const all = buildOutstandingRows("receivable", "all", [client(1, 500)], monthTx, null);
    expect(all[0].amount).toBeGreaterThanOrEqual(month[0].amount);
  });
});

describe("buildOutstandingRows — 월별(month)", () => {
  it("그 달 미결제 건의 남은 금액을 거래처별로 합친다", () => {
    const monthTx = [tx({ total_amount: 1_000, paid_amount: 300 }), tx({ id: 2, total_amount: 500 })];
    const rows = buildOutstandingRows("receivable", "month", [client(1), client(2)], [], monthTx);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1_200);
  });

  it("조회 전(null)이면 빈 목록", () => {
    expect(buildOutstandingRows("receivable", "month", [client(1)], [], null)).toEqual([]);
  });
});

describe("occurredLabel / partialPaidLabel", () => {
  const unsettled = [
    tx({ id: 1, transaction_date: "2026-10-13", payment_history: [{ id: 1, payment_date: "2026-10-16", amount: 10, method: "cash" }] }),
    tx({ id: 2, transaction_date: "2026-10-02", payment_history: [{ id: 2, payment_date: "2026-10-20", amount: 20, method: "cash" }] }),
    tx({ id: 3, type: "purchase", transaction_date: "2026-09-01" }),
  ];

  it("발생일은 가장 이른 날짜 하나", () => {
    expect(occurredLabel("receivable", 1, unsettled)).toBe("2026-10-02");
    expect(occurredLabel("payable", 1, unsettled)).toBe("2026-09-01");
    expect(occurredLabel("receivable", 99, unsettled)).toBeNull();
  });

  it("일부 수금일은 가장 최근 날짜", () => {
    expect(partialPaidLabel("receivable", 1, unsettled)).toBe("2026-10-20");
    expect(partialPaidLabel("payable", 1, unsettled)).toBeNull();
  });
});
