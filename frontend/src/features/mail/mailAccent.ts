import type { CSSProperties } from "react";

/** 메일 화면에서 고를 수 있는 강조색 6가지. primary 는 버튼·선택 표시·링크, hover 는 눌렀을 때 쓰는 한 단계 진한 색이다. */
export interface MailAccent {
  id: string;
  label: string;
  primary: string;
  hover: string;
}

export const MAIL_ACCENTS: MailAccent[] = [
  { id: "indigo", label: "슬레이트 인디고", primary: "#4b5fd6", hover: "#3a4cc0" },
  { id: "sage", label: "포레스트 세이지", primary: "#2f6f5e", hover: "#255a4b" },
  { id: "wine", label: "와인", primary: "#8b2942", hover: "#721f35" },
  { id: "teal", label: "딥 틸", primary: "#0e7490", hover: "#0b5f78" },
  { id: "charcoal", label: "차콜", primary: "#2f3442", hover: "#1f232d" },
  // 코드 화면의 핑크(#c586c0)를 흰 글씨가 읽히도록 한 단계 진하게 했다
  { id: "pink", label: "핑크", primary: "#b0609f", hover: "#96508a" },
];

export const DEFAULT_MAIL_ACCENT = "indigo";
export const DEFAULT_CUSTOM_COLOR = "#4b5fd6";
const STORAGE_KEY = "bench.mail.accent";
const HEX = /^#[0-9a-fA-F]{6}$/;
const DARK_TEXT = "#1f2024";

/** 직접 고른 색은 "#rrggbb" 문자열 그대로 id 로 저장한다 */
export function isCustomAccent(id: string): boolean {
  return HEX.test(id);
}

export function isValidAccent(id: string): boolean {
  return isCustomAccent(id) || MAIL_ACCENTS.some((a) => a.id === id);
}

export function loadMailAccent(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isValidAccent(saved)) return saved;
  } catch {
    // 저장소를 못 읽으면 기본색
  }
  return DEFAULT_MAIL_ACCENT;
}

/** 같은 창의 다른 곳(상단 메일 탭)이 바뀐 색을 바로 따라가도록 알리는 이벤트 이름 */
export const MAIL_ACCENT_EVENT = "bench-mail-accent";
export const MAIL_ACCENT_STORAGE_KEY = STORAGE_KEY;

export function saveMailAccent(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 저장 실패는 무시 (이번 화면에서만 적용)
  }
  window.dispatchEvent(new Event(MAIL_ACCENT_EVENT));
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG 상대 휘도 (0 검정 ~ 1 흰색) */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 검정을 섞어 어둡게 한다 (amount 0~1) */
function darken(hex: string, amount: number): string {
  return rgbToHex(hexToRgb(hex).map((v) => v * (1 - amount)) as Rgb);
}

/** 강조색 바탕 위에 올릴 글자색: 흰 글씨가 안 읽힐 만큼 밝은 색이면 어두운 글씨 */
export function textOnAccent(primary: string): string {
  return contrastRatio(primary, "#ffffff") >= 3 ? "#ffffff" : DARK_TEXT;
}

/** 흰 바탕 위의 링크·선택 글자로 쓸 수 있도록, 밝은 색이면 읽힐 때까지 어둡게 한 색 */
export function accentAsText(primary: string): string {
  let color = primary;
  for (let i = 0; i < 20 && contrastRatio(color, "#ffffff") < 4.5; i++) color = darken(color, 0.08);
  return color;
}

export interface ResolvedAccent {
  primary: string;
  hover: string;
  on: string;
  text: string;
}

export function resolveMailAccent(id: string): ResolvedAccent {
  const preset = MAIL_ACCENTS.find((a) => a.id === id);
  const primary = isCustomAccent(id) ? id.toLowerCase() : (preset ?? MAIL_ACCENTS[0]).primary;
  const hover = preset ? preset.hover : darken(primary, 0.14);
  return { primary, hover, on: textOnAccent(primary), text: accentAsText(primary) };
}

/** 메일 화면 루트에 붙이면 안쪽의 bg-primary·text-primary 등이 고른 색을 따른다 (Tailwind 색 변수를 덮어쓴다). */
export function mailAccentStyle(id: string): CSSProperties {
  const a = resolveMailAccent(id);
  return {
    "--color-primary": a.primary,
    "--color-primary-hover": a.hover,
    "--color-on-primary": a.on,
    "--mail-accent-text": a.text,
  } as CSSProperties;
}
