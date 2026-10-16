import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { logDebug } from "../../../lib/logger";
import { DialogContext, type ConfirmOptions, type DialogApi, type PromptOptions } from "./useDialog";

type Pending =
  | { kind: "confirm"; message: string; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; message: string; options: PromptOptions; resolve: (value: string | null) => void };

interface Toast {
  id: number;
  message: string;
  error: boolean;
}

const TOAST_MS = 4000;

/** 앱 전체에서 useDialog() 를 쓸 수 있게 한다. 창과 알림은 화면 맨 위에 그린다(페이지를 옮겨도 알림은 남는다). */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const confirm = useCallback(
    (message: string, options: ConfirmOptions = {}) =>
      new Promise<boolean>((resolve) => {
        logDebug("Dialog", `확인 창: ${message.split("\n")[0]}`);
        setPending({ kind: "confirm", message, options, resolve });
      }),
    []
  );

  const prompt = useCallback(
    (message: string, options: PromptOptions = {}) =>
      new Promise<string | null>((resolve) => {
        logDebug("Dialog", `입력 창: ${message}`);
        setPending({ kind: "prompt", message, options, resolve });
      }),
    []
  );

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message: string, error: boolean) => {
      const id = ++toastSeq.current;
      logDebug("Dialog", `${error ? "오류" : "완료"} 알림: ${message}`);
      setToasts((prev) => [...prev, { id, message, error }]);
      if (!error) window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss]
  );

  const api = useMemo<DialogApi>(
    () => ({ confirm, prompt, notify: (m) => push(m, false), notifyError: (m) => push(m, true) }),
    [confirm, prompt, push]
  );

  // 창이 바뀔 때만 새로 만든다 (알림이 뜨며 다시 그려져도 창의 초점이 튀지 않게).
  const close = useCallback(
    (result: boolean | string | null) => {
      if (!pending) return;
      if (pending.kind === "confirm") pending.resolve(result === true);
      else pending.resolve(typeof result === "string" ? result : null);
      setPending(null);
    },
    [pending]
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && <DialogBox pending={pending} onClose={close} />}
      <div className="fixed right-4 bottom-4 z-[90] flex flex-col gap-2 w-[min(340px,calc(100vw-2rem))]" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.error ? "alert" : "status"}
            className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm text-white shadow-lg ${t.error ? "bg-[#3b1414]" : "bg-text"}`}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.error ? "bg-red-400" : "bg-green-400"}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 whitespace-pre-line break-words">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="닫기" className="shrink-0 opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </DialogContext.Provider>
  );
}

function DialogBox({ pending, onClose }: { pending: Pending; onClose: (result: boolean | string | null) => void }) {
  const [value, setValue] = useState("");
  const [showHint, setShowHint] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const danger = pending.options.danger ?? false;
  const okLabel = pending.options.okLabel ?? "확인";

  // 처음 초점: 입력 창은 입력칸, 되돌릴 수 없는 일은 [취소], 나머지는 [확인]. Esc 는 취소.
  useEffect(() => {
    (pending.kind === "prompt" ? inputRef.current : danger ? cancelRef.current : okRef.current)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(pending.kind === "confirm" ? false : null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, danger, onClose]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.kind === "confirm") return onClose(true);
    if (!value.trim()) {
      setShowHint(true);
      inputRef.current?.focus();
      return;
    }
    onClose(value);
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(pending.kind === "confirm" ? false : null);
      }}
    >
      <form
        data-no-enter-nav
        onSubmit={submit}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-message"
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl space-y-3"
      >
        <p id="dialog-message" className="text-sm font-medium text-text whitespace-pre-line break-words">
          {pending.message}
        </p>
        {pending.kind === "prompt" && (
          <>
            <textarea
              id="dialog-input"
              ref={inputRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setShowHint(false);
              }}
              onKeyDown={(e) => {
                // Enter = 확인, Shift+Enter = 줄바꿈 (브라우저 입력 창과 같은 사용감)
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={3}
              placeholder={pending.options.placeholder}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary resize-y"
            />
            {showHint && <p className="text-xs text-danger">내용을 입력해주세요.</p>}
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onClose(pending.kind === "confirm" ? false : null)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text hover:bg-bg"
          >
            취소
          </button>
          <button
            ref={okRef}
            type="submit"
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${danger ? "bg-danger hover:opacity-90" : "bg-primary hover:bg-primary-hover"}`}
          >
            {okLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
