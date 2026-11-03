import type { ScheduleEvent } from "./types";

const STORAGE_PREFIX = "bench.schedule.reminders.dismissed.";
const MAX_KEEP = 500;

/** 사용자(PC)마다 확인한 알림(일정 id)을 기억한다. 확인한 알림은 다시 띄우지 않는다. */
export function loadDismissed(userId: number): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

export function saveDismissed(userId: number, ids: number[]): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(ids.slice(-MAX_KEEP)));
  } catch {
    // 저장 실패는 무시 (이번 접속에서만 다시 뜨지 않는다)
  }
}

export function pendingReminders(events: ScheduleEvent[], dismissed: number[]): ScheduleEvent[] {
  const seen = new Set(dismissed);
  return events.filter((e) => !seen.has(e.id));
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
}

/** 팝업 목록의 일정 옆에 붙는 문구: 오늘 / D-3 / 진행 중 */
export function reminderBadge(event: ScheduleEvent, today: string): string {
  if (event.start_date === today) return "오늘";
  if (event.start_date > today) return `D-${daysBetween(today, event.start_date)}`;
  return "진행 중";
}

export function reminderTitle(events: ScheduleEvent[], today: string): string {
  const allToday = events.every((e) => e.start_date === today);
  return `${allToday ? "오늘 일정" : "일정 알림"} ${events.length}건`;
}
