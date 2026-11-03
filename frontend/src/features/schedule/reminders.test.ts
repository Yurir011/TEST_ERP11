// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadDismissed, pendingReminders, reminderBadge, reminderTitle, saveDismissed } from "./reminders";
import type { ScheduleEvent } from "./types";

const ev = (id: number, start: string, end = start): ScheduleEvent => ({
  id, title: `일정${id}`, description: null, start_date: start, end_date: end, color: "skyblue", is_lunar: false,
  is_completed: false, sort_order: id, remind_days_before: 0, recurrence_group_id: null, created_by: 1, created_by_name: "나", created_at: "2026-11-01T00:00:00Z",
});

describe("일정 알림", () => {
  beforeEach(() => localStorage.clear());

  it("확인한 알림은 기억해 두었다가 목록에서 뺀다", () => {
    expect(loadDismissed(7)).toEqual([]);
    saveDismissed(7, [1, 2]);
    expect(loadDismissed(7)).toEqual([1, 2]);
    expect(loadDismissed(8)).toEqual([]); // 다른 사용자와 섞이지 않는다
    expect(pendingReminders([ev(1, "2026-11-12"), ev(3, "2026-11-12")], loadDismissed(7)).map((e) => e.id)).toEqual([3]);
  });

  it("저장값이 망가져 있어도 빈 목록으로 본다", () => {
    localStorage.setItem("bench.schedule.reminders.dismissed.7", "{not json");
    expect(loadDismissed(7)).toEqual([]);
  });

  it("문구: 오늘 / D-N / 진행 중", () => {
    expect(reminderBadge(ev(1, "2026-11-12"), "2026-11-12")).toBe("오늘");
    expect(reminderBadge(ev(1, "2026-11-15"), "2026-11-12")).toBe("D-3");
    expect(reminderBadge(ev(1, "2026-11-10", "2026-11-14"), "2026-11-12")).toBe("진행 중");
  });

  it("제목: 모두 오늘이면 오늘 일정, 아니면 일정 알림", () => {
    expect(reminderTitle([ev(1, "2026-11-12"), ev(2, "2026-11-12")], "2026-11-12")).toBe("오늘 일정 2건");
    expect(reminderTitle([ev(1, "2026-11-12"), ev(2, "2026-11-15")], "2026-11-12")).toBe("일정 알림 2건");
  });
});
