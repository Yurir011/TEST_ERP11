import { Plus } from "lucide-react";
import { useMemo } from "react";
import { isSameDay, toISODate, WEEKDAY_LABELS } from "./dateUtils";
import { getHolidayMap } from "./holidays";
import { EVENT_COLOR_HEX, type ScheduleEvent } from "./types";

interface WeekViewProps {
  days: Date[];
  eventsByDate: Map<string, ScheduleEvent[]>;
  onDayClick: (date: Date) => void;
  onDayNumberClick: (date: Date) => void;
  onEventClick: (event: ScheduleEvent) => void;
}

export function WeekView({ days, eventsByDate, onDayClick, onDayNumberClick, onEventClick }: WeekViewProps) {
  const today = new Date();
  const years = useMemo(() => Array.from(new Set(days.map((d) => d.getFullYear()))), [days]);
  const holidayMap = useMemo(() => getHolidayMap(years), [years]);

  return (
    <div className="grid grid-cols-7 gap-3">
      {days.map((day, i) => {
        const key = toISODate(day);
        const dayEvents = eventsByDate.get(key) ?? [];
        const isToday = isSameDay(day, today);
        const holiday = holidayMap.get(key);
        const headerColor = holiday || i === 0 ? "text-danger" : i === 6 ? "text-primary" : "";

        return (
          <div key={key} className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col">
            <div className={`text-center py-2 border-b border-border ${headerColor}`}>
              <p className="text-xs">{WEEKDAY_LABELS[i]}</p>
              <button
                onClick={() => onDayNumberClick(day)}
                className={`text-sm mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-bg ${
                  isToday ? "bg-primary text-white font-semibold" : ""
                }`}
              >
                {day.getDate()}
              </button>
              {holiday && <p className="text-[10px] truncate px-1">{holiday.name}</p>}
            </div>
            <div className="p-2 space-y-1 flex-1 min-h-32">
              {dayEvents.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => onEventClick(ev)}
                  className={`text-[11px] px-1.5 py-1 rounded text-white cursor-pointer truncate ${ev.is_completed ? "opacity-50 line-through" : ""}`}
                  style={{ backgroundColor: EVENT_COLOR_HEX[ev.color] }}
                  title={ev.title}
                >
                  {ev.title}
                </div>
              ))}
              <button
                onClick={() => onDayClick(day)}
                className="w-full flex items-center justify-center text-text-muted hover:text-text py-1"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
