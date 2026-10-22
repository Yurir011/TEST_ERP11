import { useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { AttendanceRecord } from "../attendance/types";
import { notifyAttendanceChanged } from "../attendance/useAttendanceToday";
import { STATUS_OPTIONS, isPresenceStatus, statusDotClass, statusLabel } from "./presence";
import { useMessenger } from "./useMessenger";

/**
 * 내 상태를 바꾸는 콤보박스 (메신저 오른쪽 위). 고른 상태는 그날 하루 유지되고 모두에게 보인다.
 * '출근'·'퇴근'을 고르면 근태 기록(출근·퇴근 시각)도 함께 남긴다(예전 출퇴근 토글과 같은 규칙). 서버가 출근을 기록하면 상태를 '출근'으로
 * 바꾸므로 그 변화는 실시간으로 이 콤보박스에도 반영된다. 그 밖의 상태(회의중·식사중·외근 등)는 상태만 바꾼다.
 */
export function PresenceSelect() {
  const { myStatus, changeMyStatus } = useMessenger();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  /** 출근·퇴근 선택을 근태 기록으로 남긴다. 기록할 수 없거나 사용자가 취소하면 false (상태도 바꾸지 않는다). */
  async function recordAttendance(value: "working" | "off"): Promise<boolean> {
    const today = await apiGet<AttendanceRecord | null>("/api/attendance/today");
    if (value === "working") {
      if (today?.clock_in && !today.clock_out) return true; // 이미 출근 중: 상태만 맞춘다
      // 퇴근 처리된 뒤 다시 '출근'을 고르면 마지막 선택이 기록이 되도록 퇴근을 취소한다 (처음 출근 시각은 그대로)
      if (today?.clock_out && !(await dialog.confirm("이미 퇴근 처리되었습니다.\n퇴근을 취소하고 다시 출근으로 기록할까요?", { okLabel: "다시 출근" }))) return false;
      logDebug("Attendance", today?.clock_out ? "상태 콤보박스: 퇴근 취소(다시 출근)" : "상태 콤보박스: 출근 처리 시도");
      await apiPost<AttendanceRecord>("/api/attendance/clock-in");
      notifyAttendanceChanged(); // 열려 있는 다른 화면의 출근 표시도 바로 맞춘다
      return true;
    }
    if (!today?.clock_in) {
      dialog.notifyError("오늘 출근 기록이 없어 퇴근 처리할 수 없습니다. 먼저 '출근'을 선택해 주세요.");
      return false;
    }
    if (today.clock_out) return true; // 이미 퇴근 처리됨: 상태만 맞춘다
    if (!(await dialog.confirm("퇴근 처리할까요?\n퇴근하면 오늘은 다시 출근으로 되돌릴 수 없습니다.", { okLabel: "퇴근하기", danger: true }))) return false;
    logDebug("Attendance", "상태 콤보박스: 퇴근 처리 시도");
    await apiPost<AttendanceRecord>("/api/attendance/clock-out");
    notifyAttendanceChanged();
    return true;
  }

  async function onChange(value: string) {
    setBusy(true);
    try {
      if ((value === "working" || value === "off") && !(await recordAttendance(value))) return;
      await changeMyStatus(value);
    } catch (err) {
      logError("Messenger", "내 상태 변경 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "상태를 바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const value = myStatus ?? "";
  // 출근 전의 '미출근'은 고르는 값이 아니라 현재 값으로만 보여 준다
  const showCurrentOnly = myStatus !== null && !STATUS_OPTIONS.some((o) => o.value === myStatus);

  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      <span className={`w-2.5 h-2.5 rounded-full ${myStatus ? statusDotClass(myStatus) : "bg-border"}`} aria-hidden />
      내 상태
      <select
        aria-label="내 상태"
        value={value}
        disabled={busy || myStatus === null}
        onChange={(e) => void onChange(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary disabled:opacity-60"
      >
        {myStatus === null && <option value="">불러오는 중...</option>}
        {showCurrentOnly && (
          <option value={myStatus} disabled>
            {isPresenceStatus(myStatus) ? statusLabel(myStatus) : myStatus}
          </option>
        )}
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
