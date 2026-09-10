export const EVENT_COLORS = ["blue", "green", "red", "orange", "purple", "pink", "teal", "gray"] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

// 절반은 선명한 톤, 절반은 채도를 낮춘 뮤트 톤으로 구성한 팔레트
export const EVENT_COLOR_HEX: Record<EventColor, string> = {
  blue: "#5B7DB1", // 뮤트 블루
  green: "#6B9971", // 뮤트 그린
  red: "#DC2626", // 선명 레드
  orange: "#EA580C", // 선명 오렌지
  purple: "#8B7BA8", // 뮤트 퍼플
  pink: "#DB2777", // 선명 핑크
  teal: "#0D9488", // 선명 틸
  gray: "#8B8578", // 뮤트 그레이(웜톤)
};

export interface ScheduleEvent {
  id: number;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  color: EventColor;
  is_completed: boolean;
  sort_order: number;
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
  recurrence_freq?: RecurrenceFreq;
  recurrence_weekdays?: number[] | null;
  recurrence_until?: string | null;
}

export type CalendarView = "month" | "week" | "day";
