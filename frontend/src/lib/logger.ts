/**
 * CLAUDE.md 규칙: 모든 실행 프로그램은 [모듈명] 형식의 디버그 메시지를 남긴다.
 * 사용 예: logDebug("Attendance", "출근 기록 요청 시작", { userId })
 */
export function logDebug(moduleName: string, message: string, data?: unknown) {
  if (data !== undefined) {
    console.debug(`[${moduleName}] ${message}`, data);
  } else {
    console.debug(`[${moduleName}] ${message}`);
  }
}

export function logError(moduleName: string, message: string, error?: unknown) {
  console.error(`[${moduleName}] ${message}`, error);
}
