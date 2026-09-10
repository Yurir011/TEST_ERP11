import { CalendarDays, Check, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { toISODate } from "./dateUtils";
import { getHolidaysForYear } from "./holidays";
import { EVENT_COLOR_HEX, type ScheduleEvent } from "./types";

interface DayViewProps {
  day: Date;
  eventsByDate: Map<string, ScheduleEvent[]>;
  onAddClick: () => void;
  onEventClick: (event: ScheduleEvent) => void;
  onToggleComplete: (event: ScheduleEvent) => void;
  onReorder: (event: ScheduleEvent, direction: "up" | "down") => void;
}

export function DayView({ day, eventsByDate, onAddClick, onEventClick, onToggleComplete, onReorder }: DayViewProps) {
  const dayEvents = eventsByDate.get(toISODate(day)) ?? [];
  const weekday = day.getDay();
  const holiday = getHolidaysForYear(day.getFullYear()).find((h) => h.date === toISODate(day));
  const headerColor = holiday || weekday === 0 ? "text-danger" : weekday === 6 ? "text-primary" : "text-text";

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className={`text-sm font-medium ${headerColor}`}>
          {day.getFullYear()}년 {day.getMonth() + 1}월 {day.getDate()}일
          {holiday && <span className="ml-2 text-xs font-normal">{holiday.name}</span>}
        </p>
        <button
          onClick={onAddClick}
          className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-bg"
        >
          <Plus size={14} />
          일정 추가
        </button>
      </div>

      {dayEvents.length === 0 ? (
        <div className="py-10 text-center">
          <CalendarDays className="mx-auto mb-2 text-text-muted" size={22} />
          <p className="text-sm text-text-muted">등록된 일정이 없습니다.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {dayEvents.map((ev, i) => (
            <li key={ev.id} className="flex items-center gap-3 bg-bg rounded-xl px-4 py-3">
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => onReorder(ev, "up")}
                  disabled={i === 0}
                  className="text-text-muted hover:text-text disabled:opacity-20"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  onClick={() => onReorder(ev, "down")}
                  disabled={i === dayEvents.length - 1}
                  className="text-text-muted hover:text-text disabled:opacity-20"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
              <button
                onClick={() => onToggleComplete(ev)}
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                  ev.is_completed ? "bg-success border-success text-white" : "border-border"
                }`}
              >
                {ev.is_completed && <Check size={12} />}
              </button>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLOR_HEX[ev.color] }} />
              <button
                onClick={() => onEventClick(ev)}
                className={`flex-1 text-left text-sm ${ev.is_completed ? "line-through text-text-muted" : ""}`}
              >
                {ev.title}
              </button>
              <span className="text-xs text-text-muted shrink-0">{ev.created_by_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
