import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { logDebug } from "../../lib/logger";

/**
 * 모바일 화면(/m/*) 전용 테마. 고른 테마는 이 폰(브라우저)에 저장되어 바꾸기 전까지 유지된다.
 * 처음에는 기본 라이트이고, PC 화면은 어떤 테마를 골라도 바뀌지 않는다.
 * 색은 index.css 의 `@theme` 변수(--color-*)를 <html> 에 덮어써서 바꾼다.
 */
export type MobileThemeKey = "default" | "slate" | "vivid" | "chic";

export interface MobileThemeInfo {
  key: MobileThemeKey;
  label: string;
  description: string;
  /** 선택 목록에 보여 줄 대표 색 (배경, 강조, 포인트) */
  swatch: [string, string, string];
  /** 어두운 테마인가 (입력창·스크롤바 등 브라우저 기본 모양을 어둡게) */
  dark: boolean;
  /** <html> 에 덮어쓸 색 변수. 기본 테마는 비워서 index.css 값을 그대로 쓴다. */
  vars: Record<string, string>;
}

const DEFAULT_THEME_COLOR = "#f7f7f8";

export const MOBILE_THEMES: MobileThemeInfo[] = [
  {
    key: "default",
    label: "기본 라이트",
    description: "지금 쓰는 색",
    swatch: ["#f7f7f8", "#2563eb", "#16a34a"],
    dark: false,
    vars: {},
  },
  {
    key: "slate",
    label: "슬레이트 다크",
    description: "무채색 다크",
    swatch: ["#16181c", "#e5e7eb", "#7fd69b"],
    dark: true,
    vars: {
      "--color-bg": "#16181c",
      "--color-surface": "#202328",
      "--color-sidebar": "#1b1d21",
      "--color-border": "#30343b",
      "--color-text": "#f1f2f4",
      "--color-text-muted": "#a0a5ae",
      "--color-primary": "#e5e7eb",
      "--color-primary-hover": "#ffffff",
      "--color-on-primary": "#16181c",
      "--color-success": "#4ade80",
      "--color-danger": "#f87171",
      "--color-notify": "#ff5a5f",
      "--color-badge-bg": "#4a1d33",
      "--color-badge-fg": "#fbcfe8",
      "--color-badge-border": "#7a2f52",
      "--color-tile-blue": "#2a3342",
      "--color-tile-blue-fg": "#93b4e8",
      "--color-tile-green": "#243a2e",
      "--color-tile-green-fg": "#7fd69b",
      "--color-tile-purple": "#352f4a",
      "--color-tile-purple-fg": "#bba8f0",
      "--color-tile-orange": "#40301f",
      "--color-tile-orange-fg": "#f0a15e",
      "--color-tile-red": "#3b2024",
      "--color-tile-gray": "#2a2d33",
      "--color-tile-gray-fg": "#b8bdc7",
    },
  },
  {
    key: "vivid",
    label: "비비드",
    description: "진하고 선명한 색",
    swatch: ["#fff6fa", "#ff2d78", "#00b86e"],
    dark: false,
    vars: {
      "--color-bg": "#fff6fa",
      "--color-surface": "#ffffff",
      "--color-sidebar": "#ffeef5",
      "--color-border": "#ffd3e4",
      "--color-text": "#220f1a",
      "--color-text-muted": "#8a5a70",
      "--color-primary": "#ff2d78",
      "--color-primary-hover": "#e11d68",
      "--color-on-primary": "#ffffff",
      "--color-tile-blue": "#dbe7ff",
      "--color-tile-blue-fg": "#1d4ed8",
      "--color-tile-green": "#c9f6e0",
      "--color-tile-green-fg": "#00875a",
      "--color-tile-purple": "#e9dcff",
      "--color-tile-purple-fg": "#6d28d9",
      "--color-tile-orange": "#ffe0c7",
      "--color-tile-orange-fg": "#d95b00",
    },
  },
  {
    key: "chic",
    label: "시크",
    description: "흑백에 금색 포인트",
    swatch: ["#efeeec", "#111111", "#9a7418"],
    dark: false,
    vars: {
      "--color-bg": "#efeeec",
      "--color-surface": "#fbfaf9",
      "--color-sidebar": "#e8e6e3",
      "--color-border": "#d6d3cd",
      "--color-text": "#111111",
      "--color-text-muted": "#6a665f",
      "--color-primary": "#111111",
      "--color-primary-hover": "#333333",
      "--color-on-primary": "#ffffff",
      "--color-tile-blue": "#e4e2de",
      "--color-tile-blue-fg": "#2b2b2b",
      "--color-tile-green": "#e4e2de",
      "--color-tile-green-fg": "#2b2b2b",
      "--color-tile-purple": "#e4e2de",
      "--color-tile-purple-fg": "#2b2b2b",
      "--color-tile-orange": "#efe3c8",
      "--color-tile-orange-fg": "#9a7418",
    },
  },
];

const STORAGE_KEY = "bench_mobile_theme";
const KEYS = new Set<string>(MOBILE_THEMES.map((t) => t.key));
// 모든 테마가 덮어쓰는 변수의 합집합. 테마를 바꾸거나 해제할 때 이전 값이 남지 않게 먼저 모두 지운다.
const ALL_VARS = Array.from(new Set(MOBILE_THEMES.flatMap((t) => Object.keys(t.vars))));

export function themeInfo(key: MobileThemeKey): MobileThemeInfo {
  return MOBILE_THEMES.find((t) => t.key === key) ?? MOBILE_THEMES[0];
}

/** 저장된 테마. 저장된 값이 없거나 알 수 없는 값이면 기본 라이트. */
export function loadMobileTheme(): MobileThemeKey {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && KEYS.has(saved) ? (saved as MobileThemeKey) : "default";
  } catch {
    return "default";
  }
}

export function saveMobileTheme(key: MobileThemeKey) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // 저장소를 쓸 수 없는 환경(시크릿 모드 등)에서는 이번 접속 동안만 적용된다.
  }
}

function setThemeColorMeta(color: string) {
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", color);
}

/** 테마를 <html> 에 적용한다 (저장은 하지 않는다). */
export function applyMobileTheme(key: MobileThemeKey) {
  const html = document.documentElement;
  for (const name of ALL_VARS) html.style.removeProperty(name);
  const theme = themeInfo(key);
  for (const [name, value] of Object.entries(theme.vars)) html.style.setProperty(name, value);
  html.style.colorScheme = theme.dark ? "dark" : "";
  html.dataset.mobileTheme = theme.key;
  setThemeColorMeta(theme.vars["--color-bg"] ?? DEFAULT_THEME_COLOR);
  logDebug("MobileTheme", `테마 적용: ${theme.key}`);
}

/** 모바일 테마를 걷어낸다 (PC 화면으로 갈 때). */
export function clearMobileTheme() {
  const html = document.documentElement;
  for (const name of ALL_VARS) html.style.removeProperty(name);
  html.style.colorScheme = "";
  delete html.dataset.mobileTheme;
  setThemeColorMeta(DEFAULT_THEME_COLOR);
}

/** 모바일 화면(/m)에서는 저장된 테마를, 그 밖의 화면에서는 기본 색을 쓴다. 화면이 그려지기 전에 적용해 깜빡이지 않는다. */
export function useMobileThemeSync() {
  const { pathname } = useLocation();
  const isMobile = pathname === "/m" || pathname.startsWith("/m/");
  useLayoutEffect(() => {
    if (isMobile) applyMobileTheme(loadMobileTheme());
    else clearMobileTheme();
  }, [isMobile]);
}
