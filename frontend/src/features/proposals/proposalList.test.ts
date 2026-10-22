import { describe, expect, it } from "vitest";
import { filterAndSortProposals, periodStart } from "./proposalList";
import type { Proposal } from "./types";

const make = (id: number, issue_date: string, title: string, vendor_name: string | null, amount: number | null) =>
  ({ id, issue_date, title, vendor_name, amount }) as unknown as Proposal;

const TODAY = new Date(2026, 9, 22); // 2026-10-22
const list = [
  make(1, "2026-10-20", "케이블 구매", "가나상사", 300000),
  make(2, "2026-10-01", "커넥터", "다라전자", 50000),
  make(3, "2026-09-10", "기판 제작", "가나상사", 1200000),
  make(4, "2026-08-10", "공구", "마바공업", 80000),
  make(5, "2026-10-15", "사무용품", null, null),
];
const run = (o: Partial<Parameters<typeof filterAndSortProposals>[1]> = {}) =>
  filterAndSortProposals(list, { months: 1, query: "", sortKey: "date", direction: "desc", today: TODAY, ...o }).map((p) => p.id);

describe("조회 기간", () => {
  it("오늘로부터 N개월 전 날짜를 구한다 (말일이 없는 달은 말일로)", () => {
    expect(periodStart(1, TODAY)).toBe("2026-09-22");
    expect(periodStart(12, TODAY)).toBe("2025-10-22");
    expect(periodStart(1, new Date(2026, 2, 31))).toBe("2026-02-28");
  });

  it("기본 1개월은 한 달 안의 품의서만, 기간을 늘리면 더 오래된 것도 보인다", () => {
    expect(run()).toEqual([1, 5, 2]);
    expect(run({ months: 2 })).toEqual([1, 5, 2, 3]);
    expect(run({ months: 3 })).toEqual([1, 5, 2, 3, 4]);
  });
});

describe("정렬", () => {
  it("날짜순은 기본이 최근 날짜 먼저, 올림차순이면 오래된 것 먼저", () => {
    expect(run({ months: 12 })).toEqual([1, 5, 2, 3, 4]);
    expect(run({ months: 12, direction: "asc" })).toEqual([4, 3, 2, 5, 1]);
  });

  it("업체명순은 가나다순이고 업체명이 없는 품의서는 맨 뒤", () => {
    expect(run({ months: 12, sortKey: "vendor", direction: "asc" })).toEqual([1, 3, 2, 4, 5]);
    expect(run({ months: 12, sortKey: "vendor", direction: "desc" })).toEqual([4, 2, 1, 3, 5]);
  });

  it("금액순은 큰 금액이 먼저(내림차순)이고 금액이 없으면 맨 뒤", () => {
    expect(run({ months: 12, sortKey: "amount", direction: "desc" })).toEqual([3, 1, 4, 2, 5]);
    expect(run({ months: 12, sortKey: "amount", direction: "asc" })).toEqual([2, 4, 1, 3, 5]);
  });
});

describe("검색", () => {
  it("업체명 또는 품의명에 단어가 들어 있으면 보이고, 기간 조건과 함께 적용된다", () => {
    expect(run({ months: 12, query: "가나" })).toEqual([1, 3]);
    expect(run({ months: 12, query: "구매" })).toEqual([1]);
    expect(run({ months: 1, query: "가나" })).toEqual([1]);
    expect(run({ months: 12, query: "  없는말 " })).toEqual([]);
  });
});
