import { toLocalISODate } from "../../lib/date";
import { diffDays, parseDate } from "./timeline";

export const MAX_NOTE_LENGTH = 2000;

export interface ProjectDateNote {
  id: number;
  note_date: string;
  content: string;
  author_name: string | null;
  created_by: number | null;
  created_at: string;
}

export interface NoteGroup {
  date: string;
  notes: ProjectDateNote[];
}

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 같은 날짜끼리 묶고 최근 날짜가 먼저 오게 한다. 같은 날짜 안에서는 받은 순서(작성 순)를 지킨다. */
export function groupNotesByDate(notes: ProjectDateNote[]): NoteGroup[] {
  const map = new Map<string, ProjectDateNote[]>();
  for (const n of notes) map.set(n.note_date, [...(map.get(n.note_date) ?? []), n]);
  return [...map.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([date, list]) => ({ date, notes: list }));
}

/** "10월 20일 (화)" */
export function formatNoteDate(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** 프로젝트 착수일 기준 "착수 +15일" / "착수 전". 착수일이 없으면 null */
export function offsetFromStart(dateStr: string, projectStart: string | null): string | null {
  if (!projectStart) return null;
  const days = diffDays(parseDate(projectStart), parseDate(dateStr));
  return days < 0 ? "착수 전" : `+${days}일`;
}

/** 서버 시각(ISO) → "09:31" */
export function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 달력 한 달 칸 목록 (일요일 시작, 앞뒤 달 날짜 포함) */
export function monthCells(year: number, month: number): { date: string; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const rows = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7);
  return Array.from({ length: rows * 7 }, (_, i) => {
    const d = new Date(year, month, 1 - first.getDay() + i);
    return { date: toLocalISODate(d), inMonth: d.getMonth() === month };
  });
}
