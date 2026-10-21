import { toLocalISODate } from "../../lib/date";
import { diffDays, parseDate } from "./timeline";

export const MAX_NOTE_LENGTH = 2000;

export interface ProjectDateNote {
  id: number;
  parent_id: number | null; // 답글이면 답글을 단 대상(원 메모 또는 다른 답글)
  reply_to_name?: string | null; // 답글을 단 대상의 작성자
  edited_at?: string | null; // 고친 시각 (고치지 않았으면 없음)
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

/** 메모(또는 답글)별 바로 아래 답글 목록. 받은 순서(작성 순)를 지킨다. */
export function repliesByParent(notes: ProjectDateNote[]): Map<number, ProjectDateNote[]> {
  const map = new Map<number, ProjectDateNote[]>();
  for (const n of notes) if (n.parent_id !== null) map.set(n.parent_id, [...(map.get(n.parent_id) ?? []), n]);
  return map;
}

/** 원 메모 아래에 달린 모든 답글·대댓글을 화면에 그릴 순서(답글 바로 밑에 그 답글의 대댓글)로 펼친다.
 * 들여쓰기는 첫 단계에서 한 번만 하므로 깊이는 알려 주지 않고, 누구에게 단 답글인지는 reply_to_name 으로 보여 준다. */
export function threadOf(rootId: number, replies: Map<number, ProjectDateNote[]>): ProjectDateNote[] {
  const out: ProjectDateNote[] = [];
  const walk = (id: number) => {
    for (const r of replies.get(id) ?? []) {
      out.push(r);
      walk(r.id);
    }
  };
  walk(rootId);
  return out;
}

/** 같은 날짜끼리 묶고 최근 날짜가 먼저 오게 한다. 같은 날짜 안에서는 받은 순서(작성 순)를 지킨다. 답글은 원 메모 밑에 붙으므로 여기엔 원 메모만 담는다. */
export function groupNotesByDate(notes: ProjectDateNote[]): NoteGroup[] {
  const map = new Map<string, ProjectDateNote[]>();
  for (const n of notes) if (n.parent_id === null) map.set(n.note_date, [...(map.get(n.note_date) ?? []), n]);
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

/** 서버 시각(ISO) → "10/21 09:31" (답글처럼 원 메모와 다른 날에 쓸 수 있는 글에 쓴다) */
export function formatNoteDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${formatNoteTime(iso)}`;
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
