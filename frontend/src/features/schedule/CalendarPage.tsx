import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { DayView } from "./DayView";
import { addDays, getMonthGridDays, getWeekDays, toISODate } from "./dateUtils";
import { EventFormModal } from "./EventFormModal";
import { MonthView } from "./MonthView";
import type { CalendarView, ScheduleEvent, ScheduleEventInput } from "./types";
import { WeekView } from "./WeekView";

const VIEW_LABELS: Record<CalendarView, string> = { month: "월", week: "주", day: "일" };

export function CalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalEvent, setModalEvent] = useState<ScheduleEvent | null>(null);

  const monthDays = useMemo(() => getMonthGridDays(anchor.getFullYear(), anchor.getMonth() + 1), [anchor]);
  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);

  const rangeStart = view === "month" ? monthDays[0] : view === "week" ? weekDays[0] : anchor;
  const rangeEnd = view === "month" ? monthDays[41] : view === "week" ? weekDays[6] : anchor;

  function loadEvents() {
    const start = toISODate(rangeStart);
    const end = toISODate(rangeEnd);
    logDebug("Calendar", `조회: ${start} ~ ${end}`);
    apiGet<ScheduleEvent[]>(`/api/schedule?start=${start}&end=${end}`)
      .then(setEvents)
      .catch((err) => {
        logError("Calendar", "조회 실패", err);
        setError("일정을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor.getFullYear(), anchor.getMonth(), anchor.getDate()]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const ev of events) {
      let cursor = new Date(ev.start_date + "T00:00:00");
      const end = new Date(ev.end_date + "T00:00:00");
      while (cursor <= end) {
        const key = toISODate(cursor);
        const list = map.get(key) ?? [];
        list.push(ev);
        map.set(key, list);
        cursor = addDays(cursor, 1);
      }
    }
    return map;
  }, [events]);

  function shift(delta: number) {
    if (view === "month") {
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
    } else if (view === "week") {
      setAnchor(addDays(anchor, delta * 7));
    } else {
      setAnchor(addDays(anchor, delta));
    }
  }

  function openCreate(date: Date) {
    setModalEvent(null);
    setModalDate(toISODate(date));
  }

  function openEdit(ev: ScheduleEvent) {
    setModalEvent(ev);
    setModalDate(ev.start_date);
  }

  function closeModal() {
    setModalDate(null);
    setModalEvent(null);
  }

  async function handleSave(input: ScheduleEventInput) {
    if (modalEvent) {
      await apiPut(`/api/schedule/${modalEvent.id}`, input);
    } else {
      await apiPost("/api/schedule", input);
    }
    closeModal();
    loadEvents();
  }

  async function handleDelete() {
    if (!modalEvent) return;
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    try {
      await apiDelete(`/api/schedule/${modalEvent.id}`);
      closeModal();
      loadEvents();
    } catch (err) {
      logError("Calendar", "삭제 실패", err);
    }
  }

  async function handleToggleComplete(ev: ScheduleEvent) {
    try {
      await apiPut(`/api/schedule/${ev.id}/complete`);
      loadEvents();
    } catch (err) {
      logError("Calendar", "완료 처리 실패", err);
    }
  }

  function openDay(date: Date) {
    setAnchor(date);
    setView("day");
  }

  async function handleReorder(ev: ScheduleEvent, direction: "up" | "down") {
    try {
      await apiPut(`/api/schedule/${ev.id}/reorder`, { direction, date: toISODate(anchor) });
      loadEvents();
    } catch (err) {
      logError("Calendar", "순서 변경 실패", err);
    }
  }

  const headerLabel =
    view === "day"
      ? `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월 ${anchor.getDate()}일`
      : `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월`;

  const canEditModalEvent = !modalEvent || modalEvent.created_by === user?.id || user?.role === "admin";

  return (
    <MainLayout
      title="일정관리"
      description="팀 일정을 캘린더로 확인합니다."
      actions={
        <button
          onClick={() => openCreate(anchor)}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          새 일정
        </button>
      }
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-surface text-text-muted">
            <ChevronLeft size={16} />
          </button>
          <p className="text-sm font-medium w-36">{headerLabel}</p>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-surface text-text-muted">
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-surface"
          >
            오늘
          </button>
        </div>

        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
          {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                view === v ? "bg-bg font-medium text-text shadow-sm" : "text-text-muted hover:text-text"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {view === "month" && (
        <MonthView
          days={monthDays}
          anchor={anchor}
          eventsByDate={eventsByDate}
          onDayClick={openCreate}
          onDayNumberClick={openDay}
          onEventClick={openEdit}
        />
      )}
      {view === "week" && (
        <WeekView
          days={weekDays}
          eventsByDate={eventsByDate}
          onDayClick={openCreate}
          onDayNumberClick={openDay}
          onEventClick={openEdit}
        />
      )}
      {view === "day" && (
        <DayView
          day={anchor}
          eventsByDate={eventsByDate}
          onAddClick={() => openCreate(anchor)}
          onEventClick={openEdit}
          onToggleComplete={handleToggleComplete}
          onReorder={handleReorder}
        />
      )}

      {modalDate && (
        <EventFormModal
          initialDate={modalDate}
          event={modalEvent}
          canEdit={canEditModalEvent}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={closeModal}
        />
      )}
    </MainLayout>
  );
}
