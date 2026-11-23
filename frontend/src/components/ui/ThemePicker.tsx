import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { logDebug } from "../../lib/logger";
import { UI_THEMES, applyUiTheme, loadUiTheme, saveUiTheme, saveUiThemeToAccount, type UiThemeKey } from "../../lib/uiTheme";

/** 화면 색 테마 선택: 고르면 바로 적용하고, 이 기기에 기억하며, 계정에도 저장한다 (다른 기기에서도 같은 색). */
export function useUiThemeChoice(): [UiThemeKey, (key: UiThemeKey) => void] {
  const [current, setCurrent] = useState<UiThemeKey>(() => loadUiTheme());

  function choose(key: UiThemeKey) {
    logDebug("ThemePicker", `테마 선택: ${key}`);
    setCurrent(key);
    saveUiTheme(key);
    applyUiTheme(key);
    void saveUiThemeToAccount(key);
  }

  return [current, choose];
}

function Swatch({ colors }: { colors: [string, string, string] }) {
  return (
    <span className="flex shrink-0" aria-hidden>
      {colors.map((c, i) => (
        <span key={i} className={`w-4 h-4 rounded-full border border-border ${i > 0 ? "-ml-1" : ""}`} style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

/** 모바일 내 정보 화면용: 라디오 목록 */
export function ThemeList() {
  const [current, choose] = useUiThemeChoice();
  return (
    <div role="radiogroup" aria-label="화면 테마" className="divide-y divide-border">
      {UI_THEMES.map((t) => (
        <button key={t.key} type="button" role="radio" aria-checked={current === t.key} onClick={() => choose(t.key)} className="w-full flex items-center gap-3 py-3 text-left">
          <Swatch colors={t.swatch} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">{t.label}</span>
            <span className="block text-[11px] text-text-muted">{t.description}</span>
          </span>
          <span aria-hidden className={`w-4 h-4 rounded-full border-2 shrink-0 ${current === t.key ? "border-primary bg-primary" : "border-border"}`} />
        </button>
      ))}
    </div>
  );
}

/** 사이드바용: 팔레트 버튼을 누르면 색 견본 칩 목록이 뜬다. 바깥을 누르거나 Esc 로 닫힌다. */
export function ThemeButton() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const [current, choose] = useUiThemeChoice();
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 248)), bottom: window.innerHeight - r.top + 8 });
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="화면 색 바꾸기"
        aria-label="화면 색 바꾸기"
        aria-expanded={open}
        className="p-2 rounded-lg text-text-muted hover:bg-surface hover:text-text transition-colors shrink-0"
      >
        <Palette size={16} />
      </button>
      {open && pos && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="화면 색 선택"
          className="fixed z-50 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
          style={{ left: pos.left, bottom: pos.bottom }}
        >
          <p className="px-2 pt-1 pb-1.5 text-[11px] text-text-muted">화면 색 (내 계정에 저장됩니다)</p>
          {UI_THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                choose(t.key);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-bg ${current === t.key ? "font-semibold" : ""}`}
            >
              <Swatch colors={t.swatch} />
              <span className="flex-1 truncate">{t.label}</span>
              {current === t.key && <Check size={14} className="text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
