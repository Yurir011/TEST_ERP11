import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { isAdminRole } from "../../lib/auth";
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
    setAnchor((prev) => {
      if (view === "month") return new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      if (view === "week") return addDays(prev, delta * 7);
      return addDays(prev, delta);
    });
  }

  // 드래그 이동 관련 상태
  const draggingRef = useRef<ScheduleEvent | null>(null);
  const edgeTimerRef = useRef<number | null>(null);
  const shiftRef = useRef(shift);
  shiftRef.current = shift;

  function canDrag(ev: ScheduleEvent) {
    return ev.created_by === user?.id || isAdminRole(user?.role);
  }

  function handleDragStart(ev: ScheduleEvent) {
    logDebug("Calendar", `드래그 시작: id=${ev.id}`);
    draggingRef.current = ev;
  }

  function handleDragEnd() {
    draggingRef.current = null;
    stopEdgeShift();
  }

  async function handleMoveEvent(targetDate: string) {
    const ev = draggingRef.current;
    draggingRef.current = null;
    stopEdgeShift();
    if (!ev || ev.start_date === targetDate) return;
    const diff = Math.round(
      (new Date(targetDate + "T00:00:00").getTime() - new Date(ev.start_date + "T00:00:00").getTime()) / 86400000,
    );
    const newStart = targetDate;
    const newEnd = toISODate(addDays(new Date(ev.end_date + "T00:00:00"), diff));
    logDebug("Calendar", `일정 이동: id=${ev.id}, ${ev.start_date} -> ${newStart}`);
    try {
      await apiPut(`/api/schedule/${ev.id}`, {
        title: ev.title,
        description: ev.description,
        start_date: newStart,
        end_date: newEnd,
        color: ev.color,
        is_lunar: ev.is_lunar,
      });
      loadEvents();
    } catch (err) {
      logError("Calendar", "일정 이동 실패", err);
      setError("일정을 이동하지 못했습니다.");
    }
  }

  // 일정을 끌고 이전/다음 버튼 위에 머무르면 자동으로 페이지를 넘긴다.
  function startEdgeShift(delta: number) {
    if (!draggingRef.current || edgeTimerRef.current !== null) return;
    edgeTimerRef.current = window.setInterval(() => shiftRef.current(delta), 700);
  }

  function stopEdgeShift() {
    if (edgeTimerRef.current !== null) {
      window.clearInterval(edgeTimerRef.current);
      edgeTimerRef.current = null;
    }
  }

  // 캘린더 위에서 마우스 휠을 굴리면 이전/다음으로 넘긴다. (연속 입력은 0.4초 간격으로 제한)
  const wheelAreaRef = useRef<HTMLDivElement | null>(null);
  const lastWheelRef = useRef(0);

  useEffect(() => {
    const el = wheelAreaRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) < 4) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelRef.current < 400) return;
      lastWheelRef.current = now;
      logDebug("Calendar", `휠 이동: ${e.deltaY > 0 ? "다음" : "이전"}`);
      shiftRef.current(e.deltaY > 0 ? 1 : -1);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // 빈 영역을 좌우로 끌면(스와이프) 이전/다음으로 넘긴다.
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  function handleSwipeDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('[draggable="true"], button, input, textarea')) return;
    swipeRef.current = { x: e.clientX, y: e.clientY };
  }

  function handleSwipeUp(e: React.PointerEvent) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || view === "day") return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      logDebug("Calendar", `스와이프 이동: ${dx < 0 ? "다음" : "이전"}`);
      shift(dx < 0 ? 1 : -1);
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

  const canEditModalEvent = !modalEvent || modalEvent.created_by === user?.id || isAdminRole(user?.role);

  return (
    <MainLayout
      title="일정관리"
      description="나의 개인 일정을 캘린더로 확인합니다. (다른 직원에게 공유되지 않습니다)"
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
          <button
            onClick={() => shift(-1)}
            onDragEnter={() => startEdgeShift(-1)}
            onDragLeave={stopEdgeShift}
            onDragOver={(e) => e.preventDefault()}
            className="p-1.5 rounded-lg hover:bg-surface text-text-muted"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="flex items-baseline gap-0.5 w-44 justify-center">
            <span className="text-[40px] font-extrabold leading-none tracking-tight">{anchor.getMonth() + 1}</span>
            <span className="text-base font-bold mr-1.5">월</span>
            <span className="text-[13px] font-medium text-text-muted">
              {anchor.getFullYear()}년{view === "day" && ` ${anchor.getDate()}일`}
            </span>
          </p>
          <button
            onClick={() => shift(1)}
            onDragEnter={() => startEdgeShift(1)}
            onDragLeave={stopEdgeShift}
            onDragOver={(e) => e.preventDefault()}
            className="p-1.5 rounded-lg hover:bg-surface text-text-muted"
          >
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

      <div ref={wheelAreaRef} onPointerDown={handleSwipeDown} onPointerUp={handleSwipeUp} className="select-none">
      {view === "month" && (
        <MonthView
          days={monthDays}
          anchor={anchor}
          eventsByDate={eventsByDate}
          onDayClick={openCreate}
          onDayNumberClick={openDay}
          onEventClick={openEdit}
          canDrag={canDrag}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnDate={handleMoveEvent}
        />
      )}
      {view === "week" && (
        <WeekView
          days={weekDays}
          eventsByDate={eventsByDate}
          onDayClick={openCreate}
          onDayNumberClick={openDay}
          onEventClick={openEdit}
          canDrag={canDrag}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnDate={handleMoveEvent}
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
      </div>

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
