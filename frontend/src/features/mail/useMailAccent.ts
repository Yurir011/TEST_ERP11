import { useSyncExternalStore } from "react";
import { MAIL_ACCENT_EVENT, MAIL_ACCENT_STORAGE_KEY, loadMailAccent } from "./mailAccent";

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === MAIL_ACCENT_STORAGE_KEY) onChange(); // 다른 창(메일 별도 창)에서 바꾼 경우
  };
  window.addEventListener(MAIL_ACCENT_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MAIL_ACCENT_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** 사용자가 고른 메일 강조색(id). 메일 화면에서 바꾸면 탭 같은 다른 곳도 바로 따라간다. */
export function useMailAccent(): string {
  return useSyncExternalStore(subscribe, loadMailAccent, () => "indigo");
}
