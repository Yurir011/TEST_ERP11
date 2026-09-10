import { useMemo } from "react";
import { isSameDay, isSameMonth, toISODate, WEEKDAY_LABELS } from "./dateUtils";
import { getHolidayMap, getLunarLabel } from "./holidays";
import { EVENT_COLOR_HEX, type ScheduleEvent } from "./types";

interface MonthViewProps {
  days: Date[];
  anchor: Date;
  eventsByDate: Map<string, ScheduleEvent[]>;
  onDayClick: (date: Date) => void;
  onDayNumberClick: (date: Date) => void;
  onEventClick: (event: ScheduleEvent) => void;
}

export function MonthView({ days, anchor, eventsByDate, onDayClick, onDayNumberClick, onEventClick }: MonthViewProps) {
  const today = new Date();
  const years = useMemo(() => Array.from(new Set(days.map((d) => d.getFullYear()))), [days]);
  const holidayMap = useMemo(() => getHolidayMap(years), [years]);

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`text-center text-xs font-medium py-2 ${i === 0 ? "text-danger" : i === 6 ? "text-primary" : "text-text-muted"}`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = toISODate(day);
          const dayEvents = eventsByDate.get(key) ?? [];
          const inMonth = isSameMonth(day, anchor);
          const isToday = isSameDay(day, today);
          const holiday = holidayMap.get(key);
          const weekday = day.getDay();
          const isSunday = weekday === 0;
          const isSaturday = weekday === 6;

          let numberColorClass = inMonth ? "text-text" : "text-text-muted";
          if (inMonth) {
            if (holiday || isSunday) numberColorClass = "text-danger";
            else if (isSaturday) numberColorClass = "text-primary";
          }

          return (
            <div
              key={key}
              onClick={() => onDayClick(day)}
              role="button"
              tabIndex={0}
              className={`min-h-24 border-b border-r border-border p-1.5 text-left align-top hover:bg-bg transition-colors cursor-pointer ${
                inMonth ? "" : "bg-bg/50"
              }`}
            >
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDayNumberClick(day);
                  }}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                    isToday ? "bg-primary text-white font-medium" : `${numberColorClass} hover:bg-border`
                  }`}
                >
                  {day.getDate()}
                </button>
                {day.getDate() === 1 && <span className="text-[9px] text-text-muted">{getLunarLabel(day)}</span>}
              </div>
              <div className="mt-1 space-y-0.5">
                {holiday && (
                  <p className="text-[11px] text-danger truncate font-medium" title={holiday.name}>
                    {holiday.name}
                  </p>
                )}
                {dayEvents.slice(0, holiday ? 2 : 3).map((ev) => (
                  <div
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    className={`text-[11px] px-1.5 py-0.5 rounded truncate text-white ${ev.is_completed ? "opacity-50 line-through" : ""}`}
                    style={{ backgroundColor: EVENT_COLOR_HEX[ev.color] }}
                    title={ev.title}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > (holiday ? 2 : 3) && (
                  <p
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayNumberClick(day);
                    }}
                    className="text-[10px] text-text-muted px-1.5 hover:underline"
                  >
                    +{dayEvents.length - (holiday ? 2 : 3)}개 더보기
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
