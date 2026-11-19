import { useLayoutEffect } from "react";
import { useAuth } from "../context/useAuth";
import { logDebug } from "./logger";

/**
 * 화면 색 테마 (PC·모바일 공용). 직원이 사이드바(모바일은 내 정보)에서 고르면 계정에 저장되어 어느 기기에서 로그인해도 같다.
 * 색은 index.css 의 `@theme` 변수(--color-*)를 <html> 에 덮어써서 바꾼다. 기본(classic)은 덮어쓰지 않는다.
 * 백엔드 허용 키(app/schemas/user.py 의 UI_THEMES)와 같아야 한다.
 */
export type UiThemeKey = "classic" | "mocha" | "rose" | "lavender" | "teal" | "midnight" | "hotpink";

export interface UiThemeInfo {
  key: UiThemeKey;
  label: string;
  description: string;
  /** 선택 목록에 보여 줄 대표 색 (바탕, 사이드바, 강조) */
  swatch: [string, string, string];
  /** 어두운 테마인가 (입력창·스크롤바 등 브라우저 기본 모양을 어둡게) */
  dark: boolean;
  vars: Record<string, string>;
}

/** 연한 테마가 공통으로 바꾸는 변수를 만든다 (강조색 계열 연한 칸 = tile-blue) */
function lightTheme(c: {
  bg: string;
  sidebar: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  hover: string;
  soft: string;
  header: string;
  headerBorder: string;
}): Record<string, string> {
  return {
    "--color-bg": c.bg,
    "--color-surface": "#ffffff",
    "--color-sidebar": c.sidebar,
    "--color-border": c.border,
    "--color-text": c.text,
    "--color-text-muted": c.muted,
    "--color-primary": c.primary,
    "--color-primary-hover": c.hover,
    "--color-tile-blue": c.soft,
    "--color-tile-blue-fg": c.primary,
    "--color-header": c.header,
    "--color-header-border": c.headerBorder,
  };
}

export const UI_THEMES: UiThemeInfo[] = [
  { key: "classic", label: "클래식 블루", description: "지금 쓰는 색", swatch: ["#f7f7f8", "#f2f2f3", "#2563eb"], dark: false, vars: {} },
  {
    key: "mocha",
    label: "모카 베이지",
    description: "따뜻한 갈색 포인트",
    swatch: ["#f7f6f5", "#f1ede9", "#8c5a32"],
    dark: false,
    vars: lightTheme({ bg: "#f7f6f5", sidebar: "#f1ede9", border: "#e2dcd6", text: "#211d1a", muted: "#665d55", primary: "#8c5a32", hover: "#764a27", soft: "#f4e9dc", header: "#826a54", headerBorder: "#6e5844" }),
  },
  {
    key: "rose",
    label: "더스티 로즈",
    description: "부드러운 와인 핑크",
    swatch: ["#faf6f6", "#f5eaea", "#b04a62"],
    dark: false,
    vars: lightTheme({ bg: "#faf6f6", sidebar: "#f5eaea", border: "#ebdcdd", text: "#2a2022", muted: "#75636a", primary: "#b04a62", hover: "#963d53", soft: "#f8e6ea", header: "#a2707f", headerBorder: "#8d5f6d" }),
  },
  {
    key: "lavender",
    label: "라벤더",
    description: "산뜻한 보라",
    swatch: ["#f7f5fb", "#eeeaf7", "#7357c8"],
    dark: false,
    vars: lightTheme({ bg: "#f7f5fb", sidebar: "#eeeaf7", border: "#e3ddf0", text: "#231f30", muted: "#6a6480", primary: "#7357c8", hover: "#5e44ad", soft: "#efeafb", header: "#8377aa", headerBorder: "#716596" }),
  },
  {
    key: "teal",
    label: "오션 틸",
    description: "시원한 청록",
    swatch: ["#f2f7f7", "#e3efef", "#0e7c86"],
    dark: false,
    vars: lightTheme({ bg: "#f2f7f7", sidebar: "#e3efef", border: "#d5e5e5", text: "#14282b", muted: "#58706f", primary: "#0e7c86", hover: "#0b656d", soft: "#dff1f2", header: "#4e7e84", headerBorder: "#406d73" }),
  },
  {
    key: "hotpink",
    label: "핫핑크 비비드",
    description: "선명한 핫핑크",
    swatch: ["#fff7fa", "#ffe6f1", "#f0147d"],
    dark: false,
    vars: lightTheme({ bg: "#fff7fa", sidebar: "#ffe6f1", border: "#f6d3e3", text: "#2a1220", muted: "#82506b", primary: "#f0147d", hover: "#d10f6b", soft: "#ffe0ee", header: "#bc648d", headerBorder: "#a6557c" }),
  },
  {
    key: "midnight",
    label: "미드나잇 블루",
    description: "깊은 남색 다크",
    swatch: ["#0f172a", "#0a1020", "#6db1ff"],
    dark: true,
    vars: {
      "--color-bg": "#0f172a",
      "--color-surface": "#1c2745",
      "--color-sidebar": "#0a1020",
      "--color-border": "#3a4a70",
      "--color-text": "#f3f6ff",
      "--color-text-muted": "#b3bfdc",
      "--color-primary": "#6db1ff",
      "--color-primary-hover": "#8cc1ff",
      "--color-on-primary": "#04101f",
      "--color-success": "#4ade80",
      "--color-danger": "#f87171",
      "--color-notify": "#ff5a5f",
      "--color-badge-bg": "#4a1d33",
      "--color-badge-fg": "#fbcfe8",
      "--color-badge-border": "#7a2f52",
      "--color-header": "#3e4f73",
      "--color-header-border": "#324160",
      "--color-tile-blue": "#26386a",
      "--color-tile-blue-fg": "#8cc1ff",
      "--color-tile-green": "#1f3b33",
      "--color-tile-green-fg": "#7fe0b4",
      "--color-tile-purple": "#34305a",
      "--color-tile-purple-fg": "#bda6ff",
      "--color-tile-orange": "#43301f",
      "--color-tile-orange-fg": "#ffb57e",
      "--color-tile-sky": "#1f3a52",
      "--color-tile-sky-fg": "#82c8ff",
      "--color-tile-teal": "#1b3b3e",
      "--color-tile-teal-fg": "#6edae2",
      "--color-tile-rose": "#43232f",
      "--color-tile-rose-fg": "#ff93a6",
      "--color-tile-yellow": "#403a1a",
      "--color-tile-yellow-fg": "#f2d56e",
      "--color-tile-red": "#402329",
      "--color-tile-gray": "#2a3350",
      "--color-tile-gray-fg": "#c0c8dc",
      // 입금·출금 등 구분 아이콘(TypeMark): 어두운 바탕에서도 또렷하게 밝은 색 + 진한 원 + 얇은 테두리
      "--color-tm-deposit": "#7fe0b4",
      "--color-tm-withdrawal": "#ff93a6",
      "--color-tm-sales": "#82b8ff",
      "--color-tm-purchase": "#ffb57e",
      "--color-tm-transfer": "#bda6ff",
      "--color-tm-payment": "#6edae2",
      "--color-tm-refund": "#f2d56e",
      "--color-tm-balance": "#cdd2de",
      "--tm-mix": "30%",
      "--tm-ring": "45%",
    },
  },
];

const STORAGE_KEY = "bench_ui_theme";
const KEYS = new Set<string>(UI_THEMES.map((t) => t.key));
// 모든 테마가 덮어쓰는 변수의 합집합. 테마를 바꿀 때 이전 값이 남지 않게 먼저 모두 지운다.
const ALL_VARS = Array.from(new Set(UI_THEMES.flatMap((t) => Object.keys(t.vars))));
const DEFAULT_THEME_COLOR = "#f7f7f8";

export function uiThemeInfo(key: UiThemeKey): UiThemeInfo {
  return UI_THEMES.find((t) => t.key === key) ?? UI_THEMES[0];
}

export function isUiThemeKey(value: string | null | undefined): value is UiThemeKey {
  return !!value && KEYS.has(value);
}

/** 이 기기에 기억해 둔 마지막 테마. 로그인 화면이나 로그인 직후 깜빡임을 줄이는 용도다. */
export function loadUiTheme(): UiThemeKey {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isUiThemeKey(saved) ? saved : "classic";
  } catch {
    return "classic";
  }
}

export function saveUiTheme(key: UiThemeKey) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 이번 접속 동안만 적용된다.
  }
}

function setThemeColorMeta(color: string) {
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", color);
}

/** 테마를 <html> 에 적용한다 (저장은 하지 않는다). */
export function applyUiTheme(key: UiThemeKey) {
  const html = document.documentElement;
  for (const name of ALL_VARS) html.style.removeProperty(name);
  const theme = uiThemeInfo(key);
  for (const [name, value] of Object.entries(theme.vars)) html.style.setProperty(name, value);
  html.style.colorScheme = theme.dark ? "dark" : "";
  html.dataset.uiTheme = theme.key;
  if (theme.dark) html.dataset.uiDark = "1";
  else delete html.dataset.uiDark;
  setThemeColorMeta(theme.vars["--color-bg"] ?? DEFAULT_THEME_COLOR);
  logDebug("UiTheme", `테마 적용: ${theme.key}`);
}

/**
 * 로그인한 직원은 계정에 저장된 테마를, 로그인 전에는 이 기기에 기억한 테마를 쓴다.
 * 화면이 그려지기 전에 적용해 깜빡이지 않는다. 직원이 고른 테마는 ThemePicker 가 바로 적용·저장한다.
 */
export function useUiThemeSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const accountTheme = user?.ui_theme ?? null;
  useLayoutEffect(() => {
    if (userId === null) {
      applyUiTheme(loadUiTheme());
      return;
    }
    const key = isUiThemeKey(accountTheme) ? accountTheme : "classic";
    saveUiTheme(key);
    applyUiTheme(key);
    // 로그인한 직원이 바뀔 때만 계정 값으로 맞춘다 (직접 고른 직후의 값을 되돌리지 않도록 accountTheme 는 제외)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
