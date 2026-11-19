import { useMemo, useState } from "react";
import { isSameDay, isSameMonth, toISODate, WEEKDAY_LABELS } from "./dateUtils";
import { getHolidayMap, getLunarLabel } from "./holidays";
import { EVENT_COLORS, EVENT_COLOR_STYLES, eventColorStyle, type ScheduleEvent } from "./types";

interface MonthViewProps {
  days: Date[];
  anchor: Date;
  eventsByDate: Map<string, ScheduleEvent[]>;
  dayColors: Record<string, string>;
  onDayColor: (date: string, color: string | null) => void;
  onDayClick: (date: Date) => void;
  onDayNumberClick: (date: Date) => void;
  onEventClick: (event: ScheduleEvent) => void;
  canDrag: (event: ScheduleEvent) => boolean;
  onDragStart: (event: ScheduleEvent) => void;
  onDragEnd: () => void;
  onDropOnDate: (date: string) => void;
}

export function MonthView({ days, anchor, eventsByDate, dayColors, onDayColor, onDayClick, onDayNumberClick, onEventClick, canDrag, onDragStart, onDragEnd, onDropOnDate }: MonthViewProps) {
  const today = new Date();
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  // 날짜 칸을 오른쪽 클릭하면 뜨는 색 고르기 (화면 좌표 기준)
  const [colorMenu, setColorMenu] = useState<{ key: string; x: number; y: number } | null>(null);
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
              onContextMenu={(e) => {
                e.preventDefault();
                setColorMenu({ key, x: e.clientX, y: e.clientY });
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverKey(key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverKey(null);
                onDropOnDate(key);
              }}
              role="button"
              tabIndex={0}
              className={`min-h-24 border-b border-r border-border p-1.5 text-left align-top hover:bg-bg transition-colors cursor-pointer ${
                inMonth ? "" : "bg-bg/50"
              } ${dragOverKey === key ? "ring-2 ring-primary ring-inset" : ""}`}
              style={dayColors[key] ? { backgroundColor: eventColorStyle(dayColors[key]).bg } : undefined}
            >
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDayNumberClick(day);
                  }}
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-base font-semibold ${
                    isToday ? "bg-primary text-white" : `${numberColorClass} hover:bg-border`
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
                    draggable={canDrag(ev)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(ev.id));
                      e.dataTransfer.effectAllowed = "move";
                      onDragStart(ev);
                    }}
                    onDragEnd={onDragEnd}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    className={`text-[11px] px-1.5 py-0.5 rounded truncate font-medium ${ev.is_completed ? "opacity-50 line-through" : ""}`}
                    style={{ backgroundColor: eventColorStyle(ev.color).bg, color: eventColorStyle(ev.color).fg }}
                    title={ev.title}
                  >
                    {ev.sticker}
                    {ev.is_lunar && "[음] "}
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
      {colorMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setColorMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setColorMenu(null);
            }}
          />
          <div
            className="fixed z-50 w-40 rounded-lg border border-border bg-surface p-2 shadow-lg"
            style={{ left: Math.min(colorMenu.x, window.innerWidth - 170), top: Math.min(colorMenu.y, window.innerHeight - 120) }}
          >
            <p className="mb-1.5 text-[11px] text-text-muted">{colorMenu.key} 칸 색</p>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => {
                    onDayColor(colorMenu.key, c);
                    setColorMenu(null);
                  }}
                  className="h-5 w-5 rounded-full border border-border"
                  style={{ backgroundColor: EVENT_COLOR_STYLES[c].bg }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                onDayColor(colorMenu.key, null);
                setColorMenu(null);
              }}
              className="mt-2 text-xs text-text-muted hover:text-text"
            >
              색 지우기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
