import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { todayISO } from "../../lib/date";
import { ReceiveDatePicker } from "./ReceiveDatePicker";

/** 입고 처리된 건의 입고 날짜를 고치는 작은 창 */
export function ReceiveDateModal({
  title,
  initial,
  busy,
  onSave,
  onClose,
}: {
  title: string;
  initial: string;
  busy: boolean;
  onSave: (iso: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initial || todayISO());
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="입고 날짜 변경" className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">입고 날짜 변경</h2>
            <p className="mt-0.5 truncate text-xs text-text-muted" title={title}>
              {title}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded p-1 text-text-muted hover:bg-bg hover:text-text">
            <X size={16} />
          </button>
        </div>
        <ReceiveDatePicker value={date} onChange={setDate} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg">
            취소
          </button>
          <button type="button" disabled={busy} onClick={() => onSave(date)} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
