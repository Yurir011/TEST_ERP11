import { useEffect } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { markClockInPrompted, shouldPromptClockIn } from "./clockInPromptState";
import type { AttendanceRecord } from "./types";
import { notifyAttendanceChanged, useAttendanceToday } from "./useAttendanceToday";

/** 로그인 후 아직 출근 전이면 "출근 처리하시겠습니까?" 팝업을 한 번 띄운다 (로그인마다 1회) */
export function ClockInPrompt() {
  const { user } = useAuth();
  const dialog = useDialog();
  const { today } = useAttendanceToday();
  const userId = user?.id;
  const isSiteAdmin = user?.role === "site_admin";

  useEffect(() => {
    if (userId === undefined || isSiteAdmin || today === undefined) return; // 아직 모름
    if (!shouldPromptClockIn(userId)) return;
    markClockInPrompted(userId); // 이미 출근했어도 이번 로그인에서는 더 묻지 않는다
    if (today?.clock_in) {
      logDebug("Attendance", "로그인 출근 확인: 이미 출근함, 팝업 생략");
      return;
    }
    logDebug("Attendance", "로그인 출근 확인 팝업 표시");
    (async () => {
      if (!(await dialog.confirm("출근 처리하시겠습니까?", { okLabel: "출근하기" }))) {
        logDebug("Attendance", "로그인 출근 확인: 나중에 하기 선택");
        return;
      }
      try {
        await apiPost<AttendanceRecord>("/api/attendance/clock-in");
        logDebug("Attendance", "로그인 출근 확인: 출근 처리 완료");
        notifyAttendanceChanged();
      } catch (err) {
        logError("Attendance", "로그인 출근 확인: 출근 처리 실패", err);
        dialog.notifyError(err instanceof ApiError ? err.message : "출근 처리 중 오류가 발생했습니다.");
      }
    })();
  }, [userId, isSiteAdmin, today, dialog]);

  return null;
}
