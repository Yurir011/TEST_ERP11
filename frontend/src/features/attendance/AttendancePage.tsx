import { ChevronLeft, ChevronRight, LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { formatDuration, formatTime } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { AttendanceRecord } from "./types";

const MAX_HISTORY_MONTHS = 36;

function addMonths(year: number, month: number, delta: number) {
  const zeroIndexed = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroIndexed / 12), month: (zeroIndexed % 12) + 1 };
}

function toMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function todayLabel(record: AttendanceRecord | null) {
  if (!record || !record.clock_in) return "아직 출근 전입니다.";
  if (!record.clock_out) return `${formatTime(record.clock_in)}에 출근했습니다.`;
  return `${formatTime(record.clock_in)} 출근 · ${formatTime(record.clock_out)} 퇴근 (오늘 근무 완료)`;
}

function MonthlyTable({ records, showEmployee }: { records: AttendanceRecord[]; showEmployee: boolean }) {
  if (records.length === 0) {
    return <p className="text-sm text-text-muted py-6 text-center">해당 월의 근태 기록이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-text-muted border-b border-border">
            {showEmployee && <th className="py-2 pr-4 font-medium">직원</th>}
            <th className="py-2 pr-4 font-medium">날짜</th>
            <th className="py-2 pr-4 font-medium">출근</th>
            <th className="py-2 pr-4 font-medium">퇴근</th>
            <th className="py-2 pr-4 font-medium">근무시간</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              {showEmployee && <td className="py-2 pr-4">{r.user_name}</td>}
              <td className="py-2 pr-4">{r.work_date}</td>
              <td className="py-2 pr-4">{formatTime(r.clock_in)}</td>
              <td className="py-2 pr-4">{formatTime(r.clock_out)}</td>
              <td className="py-2 pr-4">{formatDuration(r.clock_in, r.clock_out)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AttendancePage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [myRecords, setMyRecords] = useState<AttendanceRecord[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);

  function loadToday() {
    apiGet<AttendanceRecord | null>("/api/attendance/today")
      .then(setToday)
      .catch((err) => logError("Attendance", "오늘 기록 조회 실패", err));
  }

  function loadMonth() {
    logDebug("Attendance", `월별 조회: ${year}-${month}`);
    setMonthError(null);
    apiGet<AttendanceRecord[]>(`/api/attendance/me?year=${year}&month=${month}`)
      .then(setMyRecords)
      .catch((err) => {
        logError("Attendance", "내 월별 기록 조회 실패", err);
        setMonthError(err instanceof ApiError ? err.message : "근태 기록을 불러오지 못했습니다.");
        setMyRecords([]);
      });

    if (user?.role === "admin") {
      apiGet<AttendanceRecord[]>(`/api/attendance?year=${year}&month=${month}`)
        .then(setAllRecords)
        .catch((err) => logError("Attendance", "전체 월별 기록 조회 실패", err));
    }
  }

  useEffect(() => {
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const maxMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const minMonth = addMonths(maxMonth.year, maxMonth.month, -(MAX_HISTORY_MONTHS - 1));
  const isAtMin = year === minMonth.year && month === minMonth.month;
  const isAtMax = year === maxMonth.year && month === maxMonth.month;

  function shiftMonth(delta: number) {
    const next = addMonths(year, month, delta);
    const clampedTotal = Math.min(
      Math.max(next.year * 12 + next.month, minMonth.year * 12 + minMonth.month),
      maxMonth.year * 12 + maxMonth.month,
    );
    setYear(Math.floor((clampedTotal - 1) / 12));
    setMonth(((clampedTotal - 1) % 12) + 1);
  }

  function handleMonthInputChange(value: string) {
    const [y, m] = value.split("-").map(Number);
    if (!y || !m) return;
    setYear(y);
    setMonth(m);
  }

  async function handleClockIn() {
    setIsBusy(true);
    setError(null);
    try {
      const record = await apiPost<AttendanceRecord>("/api/attendance/clock-in");
      setToday(record);
      loadMonth();
    } catch (err) {
      logError("Attendance", "출근 처리 실패", err);
      setError(err instanceof ApiError ? err.message : "출근 처리 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClockOut() {
    setIsBusy(true);
    setError(null);
    try {
      const record = await apiPost<AttendanceRecord>("/api/attendance/clock-out");
      setToday(record);
      loadMonth();
    } catch (err) {
      logError("Attendance", "퇴근 처리 실패", err);
      setError(err instanceof ApiError ? err.message : "퇴근 처리 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  const canClockIn = !today || !today.clock_in;
  const canClockOut = today && today.clock_in && !today.clock_out;

  return (
    <MainLayout title="출퇴근기록" description="출근/퇴근을 기록하고 근태 이력을 확인합니다.">
      <div className="bg-surface border border-border rounded-2xl p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">오늘 근태</p>
          <p className="text-sm text-text-muted mt-1">{todayLabel(today)}</p>
          {error && <p className="text-xs text-danger mt-1">{error}</p>}
        </div>
        <div className="flex items-center gap-2">
          {canClockIn && (
            <button
              onClick={handleClockIn}
              disabled={isBusy}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              <LogIn size={16} />
              출근하기
            </button>
          )}
          {canClockOut && (
            <button
              onClick={handleClockOut}
              disabled={isBusy}
              className="flex items-center gap-1.5 bg-text hover:opacity-90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              <LogOut size={16} />
              퇴근하기
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-text-muted">내 근태 기록 (월별, 최근 {MAX_HISTORY_MONTHS}개월까지)</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            disabled={isAtMin}
            className="p-1.5 rounded-lg hover:bg-surface text-text-muted disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={toMonthValue(year, month)}
            min={toMonthValue(minMonth.year, minMonth.month)}
            max={toMonthValue(maxMonth.year, maxMonth.month)}
            onChange={(e) => handleMonthInputChange(e.target.value)}
            className="text-sm font-medium border border-border rounded-lg px-2 py-1 outline-none focus:border-primary bg-bg"
          />
          <button
            onClick={() => shiftMonth(1)}
            disabled={isAtMax}
            className="p-1.5 rounded-lg hover:bg-surface text-text-muted disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="bg-surface border border-border rounded-2xl p-5 mb-8">
        {monthError ? (
          <p className="text-sm text-danger py-6 text-center">{monthError}</p>
        ) : (
          <MonthlyTable records={myRecords} showEmployee={false} />
        )}
      </div>

      {user?.role === "admin" && (
        <>
          <h2 className="text-sm font-medium text-text-muted mb-3">전체 직원 근태 현황</h2>
          <div className="bg-surface border border-border rounded-2xl p-5">
            <MonthlyTable records={allRecords} showEmployee />
          </div>
        </>
      )}
    </MainLayout>
  );
}
