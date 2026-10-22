import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/useAuth";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { AttendanceRecord } from "./types";

const CHANGED_EVENT = "attendance:changed";
/** 화면이 보이는 동안 서버의 오늘 근태를 다시 확인하는 간격 (다른 화면·다른 PC 에서 바꾼 것을 따라간다) */
const POLL_MS = 30_000;

/** 출근·퇴근을 기록한 뒤 불러서, 열려 있는 모든 화면(탭)의 출근 표시를 서버 값으로 다시 맞춘다 */
export function notifyAttendanceChanged(): void {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * 오늘 내 근태 기록 (undefined: 아직 모름, null: 오늘 기록 없음).
 * 출근 상태는 서버가 갖고 있으므로, 화면이 다시 보이거나 창이 포커스를 받을 때, 다른 화면에서 출퇴근을 눌렀을 때,
 * 로그인한 사람이 바뀔 때, 그리고 일정 간격마다 서버에서 다시 읽는다. (탭 화면은 열어 둔 채로 유지되므로 한 번 읽은 값이 오래 남지 않게 한다.)
 */
export function useAttendanceToday() {
  const { user } = useAuth();
  const userId = user?.id;
  const [today, setToday] = useState<AttendanceRecord | null | undefined>(undefined);

  const reload = useCallback(() => {
    if (userId === undefined) return;
    apiGet<AttendanceRecord | null>("/api/attendance/today")
      .then((record) => {
        logDebug("Attendance", `오늘 근태 새로 읽음: ${record?.clock_in ? (record.clock_out ? "퇴근 완료" : "근무중") : "출근 전"}`);
        setToday(record);
      })
      .catch((err) => logError("Attendance", "오늘 근태 조회 실패", err)); // 실패하면 있던 값을 그대로 둔다 (출근 전으로 되돌리지 않는다)
  }, [userId]);

  useEffect(() => {
    setToday(undefined); // 다른 사람으로 로그인했으면 이전 사람의 값을 보이지 않는다
    reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener(CHANGED_EVENT, reload);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, POLL_MS);
    return () => {
      window.removeEventListener(CHANGED_EVENT, reload);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [reload]);

  return { today, setToday, reload };
}
