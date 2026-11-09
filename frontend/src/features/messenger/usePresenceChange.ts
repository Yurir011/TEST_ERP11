import { useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { AttendanceRecord } from "../attendance/types";
import { notifyAttendanceChanged } from "../attendance/useAttendanceToday";

/**
 * 내 상태를 바꾸는 규칙 (PC 콤보박스와 모바일 상태 목록이 함께 쓴다).
 * '출근'·'퇴근'을 고르면 근태 기록(출근·퇴근 시각)도 함께 남기고, 그 밖의 상태(회의중·식사중·외근 등)는 상태만 바꾼다.
 * 기록할 수 없거나 사용자가 취소하면 상태도 바꾸지 않는다.
 * @param changeMyStatus 서버에 상태를 저장하는 함수 (메신저 컨텍스트가 준다)
 */
export function usePresenceChange(changeMyStatus: (status: string) => Promise<void>) {
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  /** 출근·퇴근 선택을 근태 기록으로 남긴다. 기록할 수 없거나 사용자가 취소하면 false. */
  async function recordAttendance(value: "working" | "off"): Promise<boolean> {
    const today = await apiGet<AttendanceRecord | null>("/api/attendance/today");
    if (value === "working") {
      if (today?.clock_in && !today.clock_out) return true; // 이미 출근 중: 상태만 맞춘다
      // 퇴근 처리된 뒤 다시 '출근'을 고르면 마지막 선택이 기록이 되도록 퇴근을 취소한다 (처음 출근 시각은 그대로)
      if (today?.clock_out && !(await dialog.confirm("이미 퇴근 처리되었습니다.\n퇴근을 취소하고 다시 출근으로 기록할까요?", { okLabel: "다시 출근" }))) return false;
      logDebug("Attendance", today?.clock_out ? "상태 변경: 퇴근 취소(다시 출근)" : "상태 변경: 출근 처리 시도");
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
    logDebug("Attendance", "상태 변경: 퇴근 처리 시도");
    await apiPost<AttendanceRecord>("/api/attendance/clock-out");
    notifyAttendanceChanged();
    return true;
  }

  async function change(value: string) {
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

  return { busy, change };
}
