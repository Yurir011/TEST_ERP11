import type { Proposal } from "./types";

/** 품의서 목록에서 고를 수 있는 조회 기간 (개월). 기본은 1개월 */
export const PERIOD_MONTHS = [1, 2, 3, 6, 12] as const;
export const DEFAULT_PERIOD_MONTHS = 1;

export type ProposalSortKey = "date" | "vendor" | "amount";
export type SortDirection = "asc" | "desc";

export const SORT_LABELS: Record<ProposalSortKey, string> = {
  date: "날짜순",
  vendor: "업체명순",
  amount: "금액순",
};

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 오늘로부터 months 개월 전 날짜 (YYYY-MM-DD). 말일이 없는 달이면 그 달 말일로 맞춘다 */
export function periodStart(months: number, today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(today.getDate(), lastDay));
  return toISO(d);
}

/** 기간(개월)과 검색어(업체명·품의명)로 걸러 정렬한다. 같은 값이면 최근 날짜·번호가 먼저 */
export function filterAndSortProposals(
  list: Proposal[],
  opts: { months: number; query: string; sortKey: ProposalSortKey; direction: SortDirection; today?: Date },
): Proposal[] {
  const start = periodStart(opts.months, opts.today);
  const q = opts.query.trim().toLowerCase();
  const filtered = list.filter((p) => {
    if (p.issue_date < start) return false;
    if (!q) return true;
    return (p.vendor_name ?? "").toLowerCase().includes(q) || p.title.toLowerCase().includes(q);
  });
  const sign = opts.direction === "asc" ? 1 : -1;
  const byDate = (a: Proposal, b: Proposal) => (a.issue_date === b.issue_date ? b.id - a.id : a.issue_date < b.issue_date ? -1 : 1);
  return [...filtered].sort((a, b) => {
    let c = 0;
    if (opts.sortKey === "vendor") {
      const av = a.vendor_name ?? "";
      const bv = b.vendor_name ?? "";
      // 업체명이 없는 품의서는 방향과 상관없이 맨 뒤로
      if (!av !== !bv) return av ? -1 : 1;
      c = av.localeCompare(bv, "ko");
    } else if (opts.sortKey === "amount") {
      const av = a.amount ?? null;
      const bv = b.amount ?? null;
      if ((av === null) !== (bv === null)) return av === null ? 1 : -1;
      c = (av ?? 0) - (bv ?? 0);
    } else {
      return sign * byDate(a, b);
    }
    return c !== 0 ? sign * c : -byDate(a, b);
  });
}
