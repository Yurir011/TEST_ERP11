/** 화면 확대·축소 (브라우저처럼 Ctrl + / Ctrl - / Ctrl 0). 순수 함수만 두어 따로 시험한다. */

/** 브라우저(Chrome)와 같은 단계 */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;
export const DEFAULT_ZOOM = 1;

export type ZoomAction = "in" | "out" | "reset";

export interface KeyInput {
  type: string;
  key: string;
  code: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
}

/** 키 입력이 확대·축소 단축키인지 (Ctrl 또는 ⌘ 와 함께: + = - _ 0 및 숫자패드). Alt 가 함께 눌리면 무시 */
export function zoomKeyAction(input: KeyInput): ZoomAction | null {
  if (input.type !== "keyDown" || input.alt || !(input.control || input.meta)) return null;
  if (input.key === "+" || input.key === "=" || input.code === "NumpadAdd") return "in";
  if (input.key === "-" || input.key === "_" || input.code === "NumpadSubtract") return "out";
  if (input.key === "0" || input.code === "Numpad0") return "reset";
  return null;
}

/** 현재 배율에서 한 단계 위/아래 배율 (끝에서는 그대로). 단계 사이의 값이면 가장 가까운 단계를 기준으로 한다 */
export function stepZoom(current: number, action: ZoomAction): number {
  if (action === "reset") return DEFAULT_ZOOM;
  let nearest = 0;
  for (let i = 1; i < ZOOM_STEPS.length; i++) if (Math.abs(ZOOM_STEPS[i] - current) < Math.abs(ZOOM_STEPS[nearest] - current)) nearest = i;
  const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, nearest + (action === "in" ? 1 : -1)));
  return ZOOM_STEPS[next];
}

/** 설정 파일에서 읽은 값을 안전한 배율로 (이상한 값은 100%) */
export function sanitizeZoom(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= ZOOM_STEPS[0] && v <= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? v : DEFAULT_ZOOM;
}
