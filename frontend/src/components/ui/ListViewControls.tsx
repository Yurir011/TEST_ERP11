import { RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import {
  DEFAULT_PERIOD_MONTHS,
  DIRECTION_LABELS,
  PERIOD_MONTHS,
  SORT_LABELS,
  STATUS_CHOICES,
  defaultDirection,
  type ListViewOptions,
  type SortDirection,
  type SortKey,
} from "../../lib/listView";

/** 목록 보기 조건의 상태: 기본은 전체 상태·최근 1개월·최근 날짜 먼저 */
export function useListView() {
  const [status, setStatus] = useState("");
  const [months, setMonths] = useState<number>(DEFAULT_PERIOD_MONTHS);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKeyState] = useState<SortKey>("date");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const options: ListViewOptions = { status, months, query, sortKey, direction };
  return {
    options,
    setStatus,
    setMonths,
    setQuery,
    setDirection,
    setSortKey: (key: SortKey) => {
      setSortKeyState(key);
      setDirection(defaultDirection(key));
    },
    reset: () => {
      setStatus("");
      setMonths(DEFAULT_PERIOD_MONTHS);
      setQuery("");
      setSortKeyState("date");
      setDirection("desc");
    },
  };
}

interface Props {
  view: ReturnType<typeof useListView>;
  /** 조건에 맞는 건수 / 전체 건수 */
  shown: number;
  total: number;
  placeholder?: string;
}

const SELECT = "h-8 rounded-lg border bg-surface px-2 text-[13px] font-semibold outline-none focus:border-primary";
/** 기본값에서 바꾼 칸은 테두리를 파랗게 해서 걸려 있는 조건을 알아보게 한다 */
const box = (changed: boolean) => `${SELECT} ${changed ? "border-primary" : "border-transparent"}`;
const LABEL = "whitespace-nowrap text-xs text-text-muted";

/** 조회 기간 · 검색 · 상태 · 정렬 패널 (모든 결재 문서 목록 공통). 라벨을 칸 옆에 두어 한 줄로 낮게 만든다 */
export function ListViewControls({ view, shown, total, placeholder = "업체명, 품의명, 프로젝트로 검색" }: Props) {
  const { options } = view;
  const status = options.status ?? "";
  return (
    <div className="mb-4">
      <div role="search" aria-label="문서 검색·정렬" className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl bg-[#efeff2] px-3 py-2">
        <div className="flex min-w-[11rem] flex-1 basis-56 items-center gap-1.5">
          <label htmlFor="lv-query" className={LABEL}>
            검색
          </label>
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              id="lv-query"
              type="search"
              aria-label="검색"
              value={options.query}
              onChange={(e) => view.setQuery(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              className={`h-8 w-full rounded-lg border bg-surface pl-8 pr-2 text-[13px] outline-none focus:border-primary ${options.query ? "border-primary" : "border-transparent"}`}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="lv-status" className={LABEL}>
            상태
          </label>
          <select id="lv-status" aria-label="상태" value={status} onChange={(e) => view.setStatus(e.target.value)} className={box(status !== "")}>
            <option value="">전체</option>
            {STATUS_CHOICES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="lv-period" className={LABEL}>
            기간
          </label>
          <select id="lv-period" aria-label="조회 기간" value={options.months} onChange={(e) => view.setMonths(Number(e.target.value))} className={box(options.months !== DEFAULT_PERIOD_MONTHS)}>
            {PERIOD_MONTHS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "전체" : `최근 ${m}개월`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="lv-sort" className={LABEL}>
            정렬 기준
          </label>
          <select id="lv-sort" aria-label="정렬 기준" value={options.sortKey} onChange={(e) => view.setSortKey(e.target.value as SortKey)} className={box(options.sortKey !== "date")}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="lv-dir" className={LABEL}>
            정렬 순서
          </label>
          <select
            id="lv-dir"
            aria-label="정렬 순서"
            value={options.direction}
            onChange={(e) => view.setDirection(e.target.value as SortDirection)}
            className={box(options.direction !== defaultDirection(options.sortKey))}
          >
            {(["desc", "asc"] as const).map((d) => (
              <option key={d} value={d}>
                {DIRECTION_LABELS[options.sortKey][d]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={view.reset}
          className="ml-auto inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent bg-surface px-3 text-xs font-bold text-text-muted hover:text-text"
        >
          <RotateCcw size={13} aria-hidden="true" />
          필터 초기화
        </button>
      </div>
      <p className="mt-1.5 text-right text-xs text-text-muted" aria-live="polite">
        검색 결과 <span className="font-semibold text-text">{shown}건</span> (전체 {total}건)
      </p>
    </div>
  );
}
