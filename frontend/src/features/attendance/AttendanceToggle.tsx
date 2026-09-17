import { useEffect, useState } from "react";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { AttendanceRecord } from "./types";

export function AttendanceToggle() {
  const [today, setToday] = useState<AttendanceRecord | null | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadToday() {
    apiGet<AttendanceRecord | null>("/api/attendance/today")
      .then(setToday)
      .catch((err) => logError("Attendance", "오늘 근태 조회 실패", err));
  }

  useEffect(() => {
    loadToday();
  }, []);

  if (today === undefined) return null;

  const isWorking = !!today?.clock_in && !today.clock_out;
  const isDone = !!today?.clock_in && !!today.clock_out;
  const isOn = isWorking || isDone;

  async function handleToggle() {
    if (isBusy || isDone) return;
    setError(null);
    setIsBusy(true);
    try {
      if (isWorking) {
        logDebug("Attendance", "헤더 토글: 퇴근 처리 시도");
        setToday(await apiPost<AttendanceRecord>("/api/attendance/clock-out"));
      } else {
        logDebug("Attendance", "헤더 토글: 출근 처리 시도");
        setToday(await apiPost<AttendanceRecord>("/api/attendance/clock-in"));
      }
    } catch (err) {
      logError("Attendance", "헤더 토글: 출퇴근 처리 실패", err);
      setError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  const label = isDone ? "퇴근 완료" : isWorking ? "근무중" : "출근 전";

  return (
    <div className="flex items-center gap-2" title={error ?? undefined}>
      <span className={`text-xs font-medium ${isWorking ? "text-success" : "text-text-muted"}`}>{label}</span>
      <button
        onClick={handleToggle}
        disabled={isBusy || isDone}
        aria-label={isWorking ? "퇴근하기" : "출근하기"}
        className={`relative w-16 h-8 rounded-full transition-colors shrink-0 disabled:cursor-not-allowed ${
          isOn ? "bg-success" : "bg-border"
        } ${isDone ? "opacity-60" : ""}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-7 h-7 rounded-full bg-white shadow-md transition-transform ${
            isOn ? "translate-x-8" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
