// 직원 상태(출근·외근·출장·휴가 등) 표시와 목록 계산 (화면과 분리한 순수 함수). 서버 규칙: backend/app/services/presence.py
import type { DirectoryUser } from "./types";

export type PresenceStatus = "working" | "meeting" | "meal" | "outside" | "trip" | "leave" | "off" | "absent";

/** 직원이 직접 고를 수 있는 상태 (콤보박스 순서). '미출근'은 출근 전에 계산으로만 나오는 상태라 고를 수 없다. */
export const STATUS_OPTIONS: { value: Exclude<PresenceStatus, "absent">; label: string }[] = [
  { value: "working", label: "출근" },
  { value: "meeting", label: "회의중" },
  { value: "meal", label: "식사중" },
  { value: "outside", label: "외근" },
  { value: "trip", label: "출장" },
  { value: "leave", label: "휴가" },
  { value: "off", label: "퇴근" },
];

const LABELS: Record<PresenceStatus, string> = {
  working: "출근",
  meeting: "회의중",
  meal: "식사중",
  outside: "외근",
  trip: "출장",
  leave: "휴가",
  off: "퇴근",
  absent: "미출근",
};

// Tailwind 는 클래스를 소스에서 그대로 찾으므로 색마다 전체 이름을 적는다.
const DOT: Record<PresenceStatus, string> = {
  working: "bg-success",
  meeting: "bg-tile-purple-fg",
  meal: "bg-tile-orange-fg",
  outside: "bg-primary",
  trip: "bg-progress-4-fg",
  leave: "bg-progress-1-fg",
  off: "bg-text-muted",
  absent: "bg-border",
};

export function isPresenceStatus(value: unknown): value is PresenceStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LABELS, value); // (in 연산자는 toString 같은 기본 속성 이름도 통과시킨다)
}

/** 알 수 없는 값(서버가 새 상태를 추가한 경우 등)은 '미출근'과 같은 회색으로 보여 주되 값은 그대로 글자로 쓴다. */
export function statusLabel(status: string): string {
  return isPresenceStatus(status) ? LABELS[status] : status;
}

export function statusDotClass(status: string): string {
  return isPresenceStatus(status) ? DOT[status] : DOT.absent;
}

/** 이름으로 찾기 (앞뒤 공백 무시, 빈 검색어는 전부) */
export function filterByName(users: DirectoryUser[], query: string): DirectoryUser[] {
  const q = query.trim();
  return q ? users.filter((u) => u.name.includes(q)) : users;
}

export function favoritesOf(users: DirectoryUser[] | null): DirectoryUser[] {
  return users ? users.filter((u) => u.is_favorite) : [];
}

/** 같은 직원의 상태만 바꾼 새 목록 (목록에 없는 직원이면 그대로) */
export function withStatus(users: DirectoryUser[], userId: number, status: string): DirectoryUser[] {
  return users.map((u) => (u.id === userId && u.status !== status ? { ...u, status } : u));
}

export function withFavorite(users: DirectoryUser[], userId: number, isFavorite: boolean): DirectoryUser[] {
  return users.map((u) => (u.id === userId && u.is_favorite !== isFavorite ? { ...u, is_favorite: isFavorite } : u));
}
