/**
 * 앱 시작·알림 동작의 순수 규칙 (main.ts 가 쓴다). Electron 에 의존하지 않아 단위 테스트가 된다.
 */

/** 윈도우 시작 시 자동 실행으로 켜질 때 붙는 옵션: 창을 띄우지 않고 트레이에만 조용히 시작한다 */
export const HIDDEN_FLAG = "--hidden";

export function startsHidden(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_FLAG);
}

/**
 * app.setLoginItemSettings 에 넘길 값. 끄면 옵션도 비워 등록 정보가 남지 않게 한다.
 * (getLoginItemSettings 도 같은 args 로 물어야 켜져 있는지 정확히 알 수 있다.)
 */
export function loginItemSettings(enabled: boolean): { openAtLogin: boolean; args: string[] } {
  return { openAtLogin: enabled, args: enabled ? [HIDDEN_FLAG] : [] };
}

/** 안 읽은 수 → Windows 작업 표시줄 배지 이미지 파일 이름 (0 이하·숫자가 아니면 배지를 지운다 = null). 10 이상은 "9+". */
export function badgeImageName(count: unknown): string | null {
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  const n = Math.trunc(count);
  if (n <= 0) return null;
  return n <= 9 ? `${n}.png` : "9plus.png";
}

/** 화면에서 받은 안 읽은 수를 0~999 로 정리한다 (이상한 값은 0) */
export function clampBadgeCount(count: unknown): number {
  return typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.min(999, Math.trunc(count))) : 0;
}

/** 알림에 붙은 대화방 번호 검사: 1 이상의 정수만 인정한다 (화면이 보낸 값을 그대로 믿지 않는다) */
export function parseConversationId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/**
 * 작업 표시줄 배지에 보일 총 개수: 메신저 안 읽은 수 + 메일 안 읽은 수 (둘을 합쳐 하나의 배지로 보여 준다).
 * 각각 0~999 로 정리한 뒤 더하고 999 를 넘기지 않는다.
 */
export function combinedBadgeCount(messenger: unknown, mail: unknown): number {
  return Math.min(999, clampBadgeCount(messenger) + clampBadgeCount(mail));
}

/** 트레이 아이콘 설명과 작업 표시줄 배지 설명 (예: "안 읽은 메시지 2건 · 메일 3통") */
export function badgeSummary(messenger: unknown, mail: unknown): string {
  const m = clampBadgeCount(messenger);
  const x = clampBadgeCount(mail);
  const parts = [...(m > 0 ? [`메시지 ${m}건`] : []), ...(x > 0 ? [`메일 ${x}통`] : [])];
  return parts.length ? `안 읽은 ${parts.join(" · ")}` : "";
}
