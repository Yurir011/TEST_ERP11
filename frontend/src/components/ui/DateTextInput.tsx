import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";

/** 숫자만 골라 YYYY-MM-DD 모양으로 맞춘다 (20261022 → 2026-10-22). 입력 중에는 있는 만큼만 보여 준다 */
export function formatDateDigits(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/** YYYY-MM-DD 가 실제 있는 날짜인가 (2026-02-30 같은 날짜는 아니다) */
export function isValidDateText(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2999) return false;
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

interface Props {
  /** 저장된 날짜(YYYY-MM-DD). 없으면 "" */
  value: string;
  /** 올바른 날짜를 다 입력하고 Enter 를 누르거나 칸을 벗어나면(또는 달력에서 고르면) 불린다. 지우면 "" */
  onCommit: (value: string) => void;
  "aria-label": string;
  className?: string;
}

/**
 * 키보드로 숫자를 쳐서 넣을 수 있는 날짜 칸 (달력 버튼으로 고를 수도 있다).
 * 브라우저 기본 날짜 칸은 연도를 치는 도중의 값(0002 등)이 바로 저장되어 버리므로, 다 입력한 뒤에만 저장한다.
 */
export function DateTextInput({ value, onCommit, "aria-label": ariaLabel, className = "" }: Props) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // 저장된 값이 밖에서 바뀌면(저장 후 다시 불러옴 등) 입력 중인 글자를 거기에 맞춘다
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
    setInvalid(false);
  }

  function commit() {
    if (draft === value) {
      setInvalid(false);
      return;
    }
    if (draft === "") {
      setInvalid(false);
      onCommit("");
      return;
    }
    if (!isValidDateText(draft)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(draft);
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="YYYY-MM-DD"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title={invalid ? "날짜를 20261022 처럼 숫자 8자리로 입력해 주세요 (없는 날짜는 입력할 수 없습니다)" : "숫자 8자리를 입력하고 Enter"}
        value={draft}
        onChange={(e) => {
          setDraft(formatDateDigits(e.target.value));
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setInvalid(false);
          }
        }}
        className={`w-28 border rounded-md px-1.5 py-1 bg-surface outline-none tabular-nums focus:border-primary ${invalid ? "border-danger" : "border-border"}`}
      />
      <button
        type="button"
        onClick={() => picker.current?.showPicker?.()}
        aria-label={`${ariaLabel} 달력에서 고르기`}
        title="달력에서 고르기"
        className="text-text-muted hover:text-primary"
      >
        <CalendarDays size={14} />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={isValidDateText(value) ? value : ""}
        onChange={(e) => e.target.value && onCommit(e.target.value)}
        className="sr-only"
      />
    </span>
  );
}
