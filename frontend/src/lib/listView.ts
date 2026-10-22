/** 목록 화면 공통: 조회 기간 · 검색 · 정렬 (품의서·견적서·거래명세서 등 모든 결재 문서 목록이 같은 규칙을 쓴다) */

/** 고를 수 있는 조회 기간 (개월). 기본은 1개월 */
export const PERIOD_MONTHS = [1, 2, 3, 6, 12] as const;
export const DEFAULT_PERIOD_MONTHS = 1;

export type SortKey = "date" | "vendor" | "amount";
export type SortDirection = "asc" | "desc";

export const SORT_LABELS: Record<SortKey, string> = {
  date: "날짜순",
  vendor: "업체명순",
  amount: "금액순",
};

/** 정렬·검색에 필요한 값만 뽑은 한 줄 */
export interface ListRowValues {
  /** YYYY-MM-DD */
  date: string;
  /** 업체(거래처)명. 없으면 "" */
  vendor: string;
  amount: number | null;
  /** 결재 상태 (pending·approved·rejected·draft). 없으면 "" */
  status: string;
  /** 검색 대상 글자 (업체명·품의명·프로젝트·문서번호·품목 등을 이어 붙인 것) */
  searchText: string;
  /** 같은 값일 때 최근 것을 먼저 두기 위한 번호 */
  id: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 오늘로부터 months 개월 전 날짜 (YYYY-MM-DD). 말일이 없는 달이면 그 달 말일로 맞춘다 */
export function periodStart(months: number, today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(today.getDate(), lastDay));
  return toISO(d);
}

/** 정렬 순서 콤보박스의 글자 (기준마다 말이 다르다). 첫째가 그 기준의 기본 방향 */
export const DIRECTION_LABELS: Record<SortKey, { asc: string; desc: string }> = {
  date: { asc: "오래된순", desc: "최신순" },
  vendor: { asc: "가나다순", desc: "가나다 역순" },
  amount: { asc: "금액 작은 순", desc: "금액 큰 순" },
};

/** 정렬 기준을 바꿀 때의 기본 방향: 업체명은 가나다순, 날짜·금액은 최신·큰 것부터 */
export const defaultDirection = (key: SortKey): SortDirection => (key === "vendor" ? "asc" : "desc");

/** 상태 콤보박스의 선택지 */
export const STATUS_CHOICES = [
  { value: "pending", label: "결재 대기" },
  { value: "approved", label: "승인" },
  { value: "rejected", label: "반려" },
] as const;

export interface ListViewOptions {
  /** 결재 상태만 보기. 없거나 "" 이면 전체 */
  status?: string;
  months: number;
  query: string;
  sortKey: SortKey;
  direction: SortDirection;
  today?: Date;
}

/** 기간(개월)과 검색어로 걸러 정렬한다. 같은 값이면 최근 날짜·번호가 먼저. 검색어는 공백으로 나눈 단어가 모두 들어 있어야 한다 */
export function filterAndSortRows<T>(items: T[], toValues: (item: T) => ListRowValues, opts: ListViewOptions): T[] {
  const start = periodStart(opts.months, opts.today);
  const words = opts.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const sign = opts.direction === "asc" ? 1 : -1;
  const keyed = items
    .map((item) => ({ item, v: toValues(item) }))
    .filter(({ v }) => {
      if (v.date < start) return false;
      if (opts.status && v.status !== opts.status) return false;
      if (words.length === 0) return true;
      const text = v.searchText.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  const byDate = (a: ListRowValues, b: ListRowValues) => (a.date === b.date ? b.id - a.id : a.date < b.date ? -1 : 1);
  keyed.sort((x, y) => {
    const a = x.v;
    const b = y.v;
    if (opts.sortKey === "date") return sign * byDate(a, b);
    let c: number;
    if (opts.sortKey === "vendor") {
      // 업체명이 없는 줄은 방향과 상관없이 맨 뒤로
      if (!a.vendor !== !b.vendor) return a.vendor ? -1 : 1;
      c = a.vendor.localeCompare(b.vendor, "ko");
    } else {
      if ((a.amount === null) !== (b.amount === null)) return a.amount === null ? 1 : -1;
      c = (a.amount ?? 0) - (b.amount ?? 0);
    }
    return c !== 0 ? sign * c : -byDate(a, b);
  });
  return keyed.map(({ item }) => item);
}
