export const EVENT_COLORS = [
  "peach",
  "skyblue",
  "sagemint",
  "lilac",
  "buttercream",
  "rose",
  "grayblue",
  "graygreen",
  "graylilac",
  "grayyellow",
  "graypink",
  "grayteal",
] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

export interface EventColorStyle {
  bg: string;
  fg: string;
}

// 연한 파스텔 6색(소프트 파스텔) + 채도를 낮춘 무채색 계열 6색(그레이 틴트)으로 구성한 팔레트.
// 글씨색(fg)은 가독성을 위해 배경보다 훨씬 짙게 잡았다.
export const EVENT_COLOR_STYLES: Record<EventColor, EventColorStyle> = {
  peach: { bg: "#FFD9C7", fg: "#7A2E0C" },
  skyblue: { bg: "#C9E4FF", fg: "#0F3D66" },
  sagemint: { bg: "#C9F2DA", fg: "#0E4A2E" },
  lilac: { bg: "#E3D3FF", fg: "#3D1F70" },
  buttercream: { bg: "#FFF2BE", fg: "#5C4600" },
  rose: { bg: "#FFD2E0", fg: "#7A1F40" },
  grayblue: { bg: "#D6DDE3", fg: "#263340" },
  graygreen: { bg: "#D8DED4", fg: "#2B3626" },
  graylilac: { bg: "#DED6E6", fg: "#342A3D" },
  grayyellow: { bg: "#E6E0CF", fg: "#3D3826" },
  graypink: { bg: "#E6D4DC", fg: "#3D2630" },
  grayteal: { bg: "#D4E0DE", fg: "#1F3D37" },
};

// 팔레트에 없는 색 값(예전 데이터 등)이 들어 있어도 화면이 깨지지 않도록 기본 색으로 대체한다.
export function eventColorStyle(color: string): EventColorStyle {
  return EVENT_COLOR_STYLES[color as EventColor] ?? EVENT_COLOR_STYLES.grayblue;
}

export interface ScheduleEvent {
  id: number;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  color: EventColor;
  is_lunar: boolean;
  is_completed: boolean;
  sort_order: number;
  remind_days_before: number | null;
  recurrence_group_id: string | null;
  created_by: number;
  created_by_name: string;
  created_at: string;
}

export type RecurrenceFreq = "none" | "daily" | "weekly" | "yearly";

export interface ScheduleEventInput {
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  color: EventColor;
  is_lunar?: boolean;
  recurrence_freq?: RecurrenceFreq;
  recurrence_weekdays?: number[] | null;
  recurrence_until?: string | null;
  lunar_occurrence_dates?: string[] | null;
  remind_days_before?: number | null;
}

/** 알림 시점 선택지: null=없음, 0=당일, 그 외=며칠 전 */
export const REMIND_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: "없음" },
  { value: 0, label: "당일" },
  { value: 1, label: "하루 전" },
  { value: 3, label: "3일 전" },
  { value: 7, label: "1주 전" },
];

export type CalendarView = "month" | "week" | "day";
