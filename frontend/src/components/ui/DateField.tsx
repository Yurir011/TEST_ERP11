import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";
import { formatDateDigits, isValidDateText } from "./DateTextInput";

interface Props {
  /** 날짜(YYYY-MM-DD). 없으면 "" */
  value: string;
  /** 올바른 날짜를 다 입력하면(또는 달력에서 고르면) 바로 불린다. 칸을 모두 지우면 "" 로 불린다. */
  onChange: (value: string) => void;
  "aria-label"?: string;
  id?: string;
  min?: string;
  max?: string;
  /** 칸 모양(테두리·글자 크기 등). 오른쪽 달력 버튼 자리를 위해 오른쪽 여백이 더해진다. */
  className?: string;
  /** true 면 가로 폭을 부모에 꽉 채운다 */
  block?: boolean;
}

/**
 * 숫자만 쳐서 넣는 날짜 칸: 연도 4자리 → 월 2자리 → 일 2자리를 탭·클릭 없이 8자리 연달아 치면 된다 (20261022 → 2026-10-22).
 * 브라우저 기본 날짜 칸(type="date")은 연도를 6자리까지 받아서 4자리를 쳐도 월로 넘어가지 않으므로 대신 쓴다.
 * 달력 버튼으로 고를 수도 있다. min/max 를 벗어나거나 없는 날짜는 값으로 보내지 않고 빨간 테두리로 알린다.
 */
export function DateField({ value, onChange, "aria-label": ariaLabel, id, min, max, className = "", block = false }: Props) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // 값이 밖에서 바뀌면(초기화·저장 후 다시 불러옴 등) 입력 중인 글자를 거기에 맞춘다
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
    setInvalid(false);
  }

  const outOfRange = (v: string) => (min !== undefined && v < min) || (max !== undefined && v > max);

  function handleChange(raw: string) {
    const next = formatDateDigits(raw);
    setDraft(next);
    if (next === "") {
      setInvalid(false);
      onChange("");
    } else if (next.length === 10) {
      const ok = isValidDateText(next) && !outOfRange(next);
      setInvalid(!ok);
      if (ok) onChange(next);
    } else {
      setInvalid(false);
    }
  }

  return (
    <span className={`relative inline-flex items-center ${block ? "w-full" : ""}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="YYYY-MM-DD"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title={invalid ? "없는 날짜이거나 입력할 수 없는 범위입니다. 숫자 8자리로 다시 입력해 주세요." : "숫자 8자리를 연달아 입력 (예: 20261022)"}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => {
          // 다 입력하지 못한 채 벗어나면 저장된 값으로 되돌린다
          if (draft !== value) {
            setDraft(value);
            setInvalid(false);
          }
        }}
        className={`pr-8 tabular-nums ${block ? "w-full" : "w-36"} ${className} ${invalid ? "!border-danger" : ""}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => picker.current?.showPicker?.()}
        aria-label={ariaLabel ? `${ariaLabel} 달력에서 고르기` : "달력에서 고르기"}
        title="달력에서 고르기"
        className="absolute right-2 text-text-muted hover:text-primary"
      >
        <CalendarDays size={14} />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        value={isValidDateText(value) ? value : ""}
        onChange={(e) => e.target.value && handleChange(e.target.value)}
        className="sr-only"
      />
    </span>
  );
}
