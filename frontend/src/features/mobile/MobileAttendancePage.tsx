import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { formatDuration, formatTime } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { AttendanceRecord } from "../attendance/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return { md: `${d.getMonth() + 1}/${d.getDate()}`, wd: WEEKDAYS[d.getDay()], isSun: d.getDay() === 0, isSat: d.getDay() === 6 };
}

export function MobileAttendancePage() {
  const now = new Date();
  const [today, setToday] = useState<AttendanceRecord | null | undefined>(undefined);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadToday() {
    apiGet<AttendanceRecord | null>("/api/attendance/today")
      .then(setToday)
      .catch((err) => {
        logError("MobileAttendance", "오늘 근태 조회 실패", err);
        setToday(null);
      });
  }

  function loadMonth() {
    logDebug("MobileAttendance", `월별 조회: ${year}-${month}`);
    setRecords(null);
    apiGet<AttendanceRecord[]>(`/api/attendance/me?year=${year}&month=${month}`)
      .then(setRecords)
      .catch((err) => {
        logError("MobileAttendance", "월별 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "근태를 불러오지 못했습니다.");
        setRecords([]);
      });
  }

  useEffect(loadToday, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadMonth, [year, month]);

  const isWorking = !!today?.clock_in && !today.clock_out;
  const isDone = !!today?.clock_in && !!today.clock_out;

  async function handleClock() {
    if (isBusy || isDone) return;
    setError(null);
    setIsBusy(true);
    try {
      const path = isWorking ? "/api/attendance/clock-out" : "/api/attendance/clock-in";
      logDebug("MobileAttendance", `출퇴근 처리 시도: ${path}`);
      setToday(await apiPost<AttendanceRecord>(path));
      loadMonth();
    } catch (err) {
      logError("MobileAttendance", "출퇴근 처리 실패", err);
      setError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  return (
    <MobileLayout title="출퇴근">
      <MobileCard className="text-center py-6">
        <p className="text-xs text-text-muted">
          {now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}
        </p>
        <p className="text-lg font-bold mt-1">{isDone ? "오늘도 수고하셨습니다" : isWorking ? "근무 중" : "출근 전"}</p>
        <div className="flex justify-center gap-8 my-4">
          <div>
            <p className="text-xs text-text-muted">출근</p>
            <p className="text-2xl font-bold tabular-nums">{formatTime(today?.clock_in ?? null)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">퇴근</p>
            <p className="text-2xl font-bold tabular-nums">{formatTime(today?.clock_out ?? null)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClock}
          disabled={isBusy || isDone || today === undefined}
          className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3.5 rounded-xl disabled:opacity-40"
        >
          {isDone ? "퇴근 완료" : isWorking ? "퇴근하기" : "출근하기"}
        </button>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
      </MobileCard>

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달" className="p-2 text-text-muted">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-semibold">
          {year}년 {month}월
        </p>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달" className="p-2 text-text-muted">
          <ChevronRight size={18} />
        </button>
      </div>

      <MobileCard className="py-1">
        {records === null ? (
          <p className="text-xs text-text-muted py-6 text-center">불러오는 중...</p>
        ) : records.length === 0 ? (
          <MobileEmpty text="이 달의 출퇴근 기록이 없습니다." />
        ) : (
          <ul>
            {records.map((r) => {
              const l = dayLabel(r.work_date);
              return (
                <li key={r.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0 text-sm">
                  <span className={`w-14 shrink-0 font-medium tabular-nums ${l.isSun ? "text-danger" : l.isSat ? "text-primary" : ""}`}>
                    {l.md} <span className="text-xs">({l.wd})</span>
                  </span>
                  <span className="flex-1 tabular-nums text-text-muted">
                    {formatTime(r.clock_in)} ~ {formatTime(r.clock_out)}
                  </span>
                  <span className="text-xs text-text-muted shrink-0">{formatDuration(r.clock_in, r.clock_out)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </MobileCard>
    </MobileLayout>
  );
}
