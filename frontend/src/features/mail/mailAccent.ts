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
const STORAGE_KEY = "bench.mail.accent";

export function loadMailAccent(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && MAIL_ACCENTS.some((a) => a.id === saved)) return saved;
  } catch {
    // 저장소를 못 읽으면 기본색
  }
  return DEFAULT_MAIL_ACCENT;
}

export function saveMailAccent(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 저장 실패는 무시 (이번 화면에서만 적용)
  }
}

/** 메일 화면 루트에 붙이면 안쪽의 bg-primary·text-primary 등이 고른 색을 따른다 (Tailwind 색 변수를 덮어쓴다). */
export function mailAccentStyle(id: string): CSSProperties {
  const accent = MAIL_ACCENTS.find((a) => a.id === id) ?? MAIL_ACCENTS[0];
  return { "--color-primary": accent.primary, "--color-primary-hover": accent.hover } as CSSProperties;
}
