import { useState } from "react";
import { toLocalISODate, todayISO } from "../../lib/date";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
};

/** 입고 날짜 고르기: [오늘] [어제] [직접 선택]. 오늘보다 뒤 날짜는 고를 수 없다. */
export function ReceiveDatePicker({ value, onChange, caption = "받은 날", groupLabel = "입고 날짜" }: { value: string; onChange: (iso: string) => void; caption?: string; groupLabel?: string }) {
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const [custom, setCustom] = useState(value !== today && value !== yesterday);
  const btn = (on: boolean) => `flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${on ? "border-primary bg-tile-blue text-primary" : "border-border bg-surface hover:bg-bg"}`;
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={groupLabel}>
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={!custom && value === today}
          onClick={() => {
            setCustom(false);
            onChange(today);
          }}
          className={btn(!custom && value === today)}
        >
          오늘
        </button>
        <button
          type="button"
          aria-pressed={!custom && value === yesterday}
          onClick={() => {
            setCustom(false);
            onChange(yesterday);
          }}
          className={btn(!custom && value === yesterday)}
        >
          어제
        </button>
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={btn(custom)}>
          직접 선택
        </button>
      </div>
      {custom && (
        <input
          type="date"
          aria-label={`${groupLabel} 직접 선택`}
          value={value}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="w-44 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
      )}
      <p className="text-xs text-text-muted">{caption}: {value}</p>
    </div>
  );
}
