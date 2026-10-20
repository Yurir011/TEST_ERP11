import { afterEach, describe, expect, it, vi } from "vitest";
import { calcStageProgress, dateToWeek, diffDays, parseDate, stageDayRange, stageWeekRange, todayFraction, weekSummary } from "./timeline";
import type { ProgressStage, Project } from "./types";

const stage = (over: Partial<ProgressStage>): ProgressStage => ({ id: 1, name: "단계", progress_percent: 0, start_date: null, end_date: null, ...over }) as ProgressStage;
const project = (start: string | null, end: string | null): Project => ({ start_date: start, end_date: end }) as Project;

afterEach(() => vi.useRealTimers());

describe("주차 계산", () => {
  it("시작일이 속한 주가 1주차", () => {
    expect(dateToWeek("2026-10-05", "2026-10-05")).toBe(1);
    expect(dateToWeek("2026-10-11", "2026-10-05")).toBe(1); // 6일째까지 1주차
    expect(dateToWeek("2026-10-12", "2026-10-05")).toBe(2);
  });

  it("두 날짜의 일수 차이", () => {
    expect(diffDays(parseDate("2026-10-05"), parseDate("2026-10-12"))).toBe(7);
  });
});

describe("stageWeekRange", () => {
  it("기간이 없으면 null", () => {
    expect(stageWeekRange(stage({}), "2026-10-05", 8)).toBeNull();
  });

  it("전체 주차 범위 안으로 잘라서 돌려준다", () => {
    const r = stageWeekRange(stage({ start_date: "2026-09-01", end_date: "2026-12-31" }), "2026-10-05", 4);
    expect(r).toEqual([1, 4]);
  });

  it("프로젝트 기간과 겹치지 않으면 null", () => {
    expect(stageWeekRange(stage({ start_date: "2026-08-01", end_date: "2026-08-10" }), "2026-10-05", 4)).toBeNull();
  });
});

describe("stageDayRange (날짜 비율)", () => {
  it("같은 주 안의 다른 날짜는 다른 위치에 놓인다", () => {
    const a = stageDayRange(stage({ start_date: "2026-10-05", end_date: "2026-10-06" }), "2026-10-05", 10)!;
    const b = stageDayRange(stage({ start_date: "2026-10-10", end_date: "2026-10-11" }), "2026-10-05", 10)!;
    expect(a.left).toBeCloseTo(0);
    expect(b.left).toBeCloseTo(5 / 70);
    expect(a.width).toBeCloseTo(2 / 70);
    expect(b.days).toBe(2);
  });

  it("전체 기간 밖으로 나가면 잘라서 그리고 일수는 실제 기간을 보여 준다", () => {
    const r = stageDayRange(stage({ start_date: "2026-09-28", end_date: "2026-12-31" }), "2026-10-05", 2)!;
    expect(r.left).toBe(0);
    expect(r.width).toBe(1);
    expect(r.days).toBe(95);
  });

  it("기간이 없거나 프로젝트 기간 밖이면 null", () => {
    expect(stageDayRange(stage({}), "2026-10-05", 4)).toBeNull();
    expect(stageDayRange(stage({ start_date: "2026-08-01", end_date: "2026-08-10" }), "2026-10-05", 4)).toBeNull();
  });
});

describe("todayFraction / weekSummary (시각 고정)", () => {
  it("오늘이 기간 안이면 비율, 밖이면 null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0)); // 시작 7일 뒤
    expect(todayFraction("2026-10-05", 2)).toBeCloseTo(0.5);
    vi.setSystemTime(new Date(2026, 8, 1));
    expect(todayFraction("2026-10-05", 2)).toBeNull();
  });

  it("주차 요약: 시작 전 / n주차 / 종료", () => {
    vi.useFakeTimers();
    const p = project("2026-10-05", "2026-10-25"); // 3주
    vi.setSystemTime(new Date(2026, 9, 1));
    expect(weekSummary(p)).toBe("시작 전 / 총 3주");
    vi.setSystemTime(new Date(2026, 9, 14));
    expect(weekSummary(p)).toBe("2주차 / 총 3주");
    vi.setSystemTime(new Date(2026, 10, 1));
    expect(weekSummary(p)).toBe("종료 / 총 3주");
  });

  it("일정이 없으면 null", () => {
    expect(weekSummary(project(null, null))).toBeNull();
  });
});

describe("calcStageProgress (종합 진행률)", () => {
  it("항목이 없으면 null", () => {
    expect(calcStageProgress([])).toBeNull();
  });

  it("평균을 가장 가까운 10 단위로 반올림한다 (서버가 10 단위만 받는다)", () => {
    expect(calcStageProgress([stage({ progress_percent: 30 }), stage({ progress_percent: 30 }), stage({ progress_percent: 40 })])).toBe(30); // 33.3 → 30
    expect(calcStageProgress([stage({ progress_percent: 20 }), stage({ progress_percent: 30 })])).toBe(30); // 25 → 30
    expect(calcStageProgress([stage({ progress_percent: 100 }), stage({ progress_percent: 0 })])).toBe(50);
  });
});
