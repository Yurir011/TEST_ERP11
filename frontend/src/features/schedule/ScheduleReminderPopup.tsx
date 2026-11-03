import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { toISODate } from "./dateUtils";
import { loadDismissed, pendingReminders, reminderBadge, reminderTitle, saveDismissed } from "./reminders";
import { eventColorStyle, type ScheduleEvent } from "./types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function todayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

/**
 * 일정에 알림을 켜 둔 날이 되면 가운데 팝업으로 알려 준다 (A안).
 * 로그인(앱 시작) 직후, 그리고 켜 둔 채 날짜가 바뀌었을 때 확인한다. [확인]을 누른 일정은 다시 띄우지 않는다.
 */
export function ScheduleReminderPopup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [today, setToday] = useState(() => toISODate(new Date()));
  const [items, setItems] = useState<ScheduleEvent[]>([]);
  const userId = user?.id ?? null;

  // 날짜가 바뀌면(자정 지남, 절전에서 깨어남) 오늘 날짜를 새로 잡는다
  useEffect(() => {
    const check = () =>
      setToday((prev) => {
        const now = toISODate(new Date());
        return now === prev ? prev : now;
      });
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);

  useEffect(() => {
    if (userId === null) {
      setItems([]);
      return;
    }
    let cancelled = false;
    logDebug("ScheduleReminder", `알림 조회 시작: on=${today}`);
    apiGet<ScheduleEvent[]>(`/api/schedule/reminders?on=${today}`)
      .then((events) => {
        if (cancelled) return;
        const pending = pendingReminders(events, loadDismissed(userId));
        logDebug("ScheduleReminder", `알림 조회 성공: 전체 ${events.length}건, 새 알림 ${pending.length}건`);
        setItems(pending);
      })
      .catch((err) => logError("ScheduleReminder", "알림 조회 실패", err));
    return () => {
      cancelled = true;
    };
  }, [userId, today]);

  const dismiss = useCallback(() => {
    if (userId === null) return;
    saveDismissed(userId, [...loadDismissed(userId), ...items.map((e) => e.id)]);
    logDebug("ScheduleReminder", `알림 확인: ${items.length}건`);
    setItems([]);
  }, [userId, items]);

  if (userId === null || items.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="schedule-reminder-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell size={26} />
        </div>
        <h2 id="schedule-reminder-title" className="text-lg font-semibold">
          {reminderTitle(items, today)}
        </h2>
        <p className="mt-0.5 text-sm text-text-muted">{todayLabel(today)}</p>

        <ul className="mt-4 max-h-[40vh] space-y-2 overflow-y-auto text-left">
          {items.map((e) => {
            const c = eventColorStyle(e.color);
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{e.title}</p>
                  <p className="text-xs text-text-muted">{e.start_date === e.end_date ? e.start_date : `${e.start_date} ~ ${e.end_date}`}</p>
                </div>
                <span className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.fg }}>
                  {reminderBadge(e, today)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={dismiss} className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-bg">
            확인
          </button>
          <button
            type="button"
            onClick={() => {
              dismiss();
              navigate("/schedule");
            }}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            일정 보기
          </button>
        </div>
      </div>
    </div>
  );
}
