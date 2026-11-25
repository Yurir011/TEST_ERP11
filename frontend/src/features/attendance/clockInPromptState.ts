// 로그인할 때마다 출근 확인 팝업을 한 번만 띄우기 위한 표시 (화면을 옮겨 다녀도 다시 묻지 않는다)
let promptedUserId: number | null = null;

export function shouldPromptClockIn(userId: number): boolean {
  return promptedUserId !== userId;
}

export function markClockInPrompted(userId: number): void {
  promptedUserId = userId;
}

/** 로그아웃하면 다음 로그인 때 다시 묻도록 지운다 */
export function resetClockInPrompt(): void {
  promptedUserId = null;
}
