import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { getMonthGridDays, isSameDay, isSameMonth, toISODate, WEEKDAY_LABELS } from "../schedule/dateUtils";
import { getHolidayMap } from "../schedule/holidays";
import { EVENT_COLOR_STYLES, type ScheduleEvent } from "../schedule/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

export function MobileSchedulePage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState(new Date());
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  // 월 달력은 앞뒤 달 날짜를 포함해 6주(42칸)로 그린다.
  const monthDays = getMonthGridDays(selected.getFullYear(), selected.getMonth() + 1);
  const holidayMap = getHolidayMap(Array.from(new Set(monthDays.map((d) => d.getFullYear()))));
  const rangeStart = toISODate(monthDays[0]);
  const rangeEnd = toISODate(monthDays[41]);

  function load() {
    logDebug("MobileSchedule", `조회: ${rangeStart} ~ ${rangeEnd}`);
    apiGet<ScheduleEvent[]>(`/api/schedule?start=${rangeStart}&end=${rangeEnd}`)
      .then(setEvents)
      .catch((err) => {
        logError("MobileSchedule", "조회 실패", err);
        setError("일정을 불러오지 못했습니다.");
        setEvents([]);
      });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [rangeStart]);

  const selectedKey = toISODate(selected);
  const dayEvents = (events ?? []).filter((e) => e.start_date <= selectedKey && e.end_date >= selectedKey);
  const holiday = holidayMap.get(selectedKey);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      logDebug("MobileSchedule", `일정 추가: ${selectedKey} ${title}`);
      await apiPost("/api/schedule", {
        title,
        description: null,
        start_date: selectedKey,
        end_date: selectedKey,
        color: "skyblue",
      });
      setTitle("");
      setShowForm(false);
      load();
    } catch (err) {
      logError("MobileSchedule", "일정 추가 실패", err);
      setError(err instanceof ApiError ? err.message : "일정을 추가하지 못했습니다.");
    }
  }

  async function handleToggle(ev: ScheduleEvent) {
    setError(null);
    try {
      await apiPut(`/api/schedule/${ev.id}/complete`);
      load();
    } catch (err) {
      logError("MobileSchedule", "완료 처리 실패", err);
      setError(err instanceof ApiError ? err.message : "처리하지 못했습니다.");
    }
  }

  /** 달을 넘긴다. 같은 일(day)을 유지하되, 다음 달에 없는 날짜(예: 31일)는 그 달의 마지막 날로 맞춘다. */
  function shiftMonth(delta: number) {
    setSelected((cur) => {
      const lastDay = new Date(cur.getFullYear(), cur.getMonth() + delta + 1, 0).getDate();
      return new Date(cur.getFullYear(), cur.getMonth() + delta, Math.min(cur.getDate(), lastDay));
    });
  }

  function handleTouchStart(e: React.TouchEvent) {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      logDebug("MobileSchedule", `스와이프: ${dx < 0 ? "다음 달" : "이전 달"}`);
      shiftMonth(dx < 0 ? 1 : -1);
    }
  }

  const canEdit = (ev: ScheduleEvent) => ev.created_by === user?.id || user?.role === "admin" || user?.role === "site_admin";

  return (
    <MobileLayout
      title="일정"
      right={
        <button type="button" onClick={() => setSelected(new Date())} className="text-xs text-primary px-3 py-2">
          오늘
        </button>
      }
    >
      <div className="space-y-4">
        <MobileCard className="!p-3" >
          <div className="flex items-center justify-between mb-2 px-1">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달" className="p-1.5 text-text-muted">
              <ChevronLeft size={20} />
            </button>
            <p className="flex items-baseline gap-0.5">
              <span className="text-[34px] font-extrabold leading-none tracking-tight">{selected.getMonth() + 1}</span>
              <span className="text-sm font-bold mr-1.5">월</span>
              <span className="text-xs font-medium text-text-muted">{selected.getFullYear()}년</span>
            </p>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달" className="p-1.5 text-text-muted">
              <ChevronRight size={20} />
            </button>
          </div>
          <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAY_LABELS.map((w, i) => (
                <span key={w} className={`text-center text-[11px] py-1 ${i === 0 ? "text-danger" : i === 6 ? "text-primary" : "text-text-muted"}`}>
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {monthDays.map((d) => {
                const key = toISODate(d);
                const inMonth = isSameMonth(d, selected);
                const isSel = isSameDay(d, selected);
                const isToday = isSameDay(d, new Date());
                const dayList = (events ?? []).filter((e) => e.start_date <= key && e.end_date >= key);
                const weekday = d.getDay();
                const red = weekday === 0 || holidayMap.has(key);
                const numColor = isSel
                  ? "text-white"
                  : !inMonth
                    ? "text-text-muted/50"
                    : red
                      ? "text-danger"
                      : weekday === 6
                        ? "text-primary"
                        : "text-text";
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(d)}
                    className="flex flex-col items-center py-0.5 active:opacity-60"
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold tabular-nums ${numColor} ${
                        isSel ? "bg-primary" : isToday ? "ring-1 ring-primary" : ""
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <span className="flex gap-0.5 h-1.5 mt-0.5">
                      {dayList.slice(0, 3).map((ev) => (
                        <span key={ev.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: EVENT_COLOR_STYLES[ev.color].fg }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </MobileCard>

        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-sm font-semibold">
              {selected.getMonth() + 1}월 {selected.getDate()}일 ({WEEKDAY_LABELS[selected.getDay()]})
            </p>
            {holiday && <p className="text-xs text-danger mt-0.5">{holiday.name}</p>}
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 text-xs border border-border bg-surface rounded-lg px-3 py-2"
          >
            <Plus size={14} />
            일정 추가
          </button>
        </div>

        {showForm && (
          <MobileCard>
            <form onSubmit={handleAdd} className="flex gap-2">
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="일정 제목"
                aria-label="일정 제목"
                className="flex-1 min-w-0 rounded-xl border border-border px-3 py-2.5 text-base outline-none focus:border-primary bg-bg"
              />
              <button type="submit" className="bg-primary text-white text-sm font-semibold px-4 rounded-xl">
                저장
              </button>
            </form>
          </MobileCard>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        {events === null ? (
          <p className="text-xs text-text-muted text-center py-8">불러오는 중...</p>
        ) : dayEvents.length === 0 ? (
          <MobileEmpty text="이 날 등록된 일정이 없습니다." />
        ) : (
          <MobileCard className="py-1">
            <ul>
              {dayEvents.map((ev) => (
                <li key={ev.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => canEdit(ev) && handleToggle(ev)}
                    aria-label="완료 표시"
                    className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                      ev.is_completed ? "bg-success border-success text-white" : "border-border"
                    }`}
                  >
                    {ev.is_completed && <Check size={14} />}
                  </button>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLOR_STYLES[ev.color].fg }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${ev.is_completed ? "line-through text-text-muted" : ""}`}>
                      {ev.is_lunar && "[음] "}
                      {ev.title}
                    </p>
                    {ev.description && <p className="text-xs text-text-muted mt-0.5 truncate">{ev.description}</p>}
                  </div>
                  <span className="text-xs text-text-muted shrink-0">{ev.created_by_name}</span>
                </li>
              ))}
            </ul>
          </MobileCard>
        )}
      </div>
    </MobileLayout>
  );
}
