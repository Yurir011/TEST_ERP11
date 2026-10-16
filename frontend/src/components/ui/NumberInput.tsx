import { useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes } from "react";

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** 콤마 없는 원본 숫자 문자열 ("1234567", 소수 허용 시 "1234.5"). 상태에는 항상 이 값만 저장한다. */
  value: string | number;
  onChange: (raw: string) => void;
  /** 소수점 입력 허용 (단가 등) */
  allowDecimal?: boolean;
}

/** 숫자 문자열에 세 자리마다 콤마를 붙인다 (소수부는 그대로). */
function formatNumberText(raw: string): string {
  if (raw === "") return "";
  const [intPart, decPart] = raw.split(".");
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart === undefined ? withComma : `${withComma}.${decPart}`;
}

function sanitize(text: string, allowDecimal: boolean): string {
  let cleaned = text.replace(allowDecimal ? /[^\d.]/g : /\D/g, "");
  if (allowDecimal) {
    const firstDot = cleaned.indexOf(".");
    if (firstDot !== -1) cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  // 불필요한 앞자리 0 제거 ("007" -> "7", "0.5"는 유지)
  return cleaned.replace(/^0+(?=\d)/, "");
}

/** 입력하면서 세 자리마다 콤마를 자동으로 붙여 보여주는 숫자 입력칸. onChange에는 콤마를 뺀 값이 전달된다. */
export function NumberInput({ value, onChange, allowDecimal = false, ...rest }: NumberInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);
  const display = formatNumberText(String(value ?? ""));

  // 콤마가 끼어들면 커서가 끝으로 튀므로, 입력 직전 커서 앞의 숫자 개수를 기억했다가 다시 맞춰준다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caretDigits.current === null || document.activeElement !== el) return;
    let pos = 0;
    let seen = 0;
    while (pos < display.length && seen < caretDigits.current) {
      if (/[\d.]/.test(display[pos])) seen += 1;
      pos += 1;
    }
    el.setSelectionRange(pos, pos);
    caretDigits.current = null;
  }, [display]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    const caret = e.target.selectionStart ?? text.length;
    caretDigits.current = text.slice(0, caret).replace(/[^\d.]/g, "").length;
    onChange(sanitize(text, allowDecimal));
  }

  return <input {...rest} ref={ref} type="text" inputMode={allowDecimal ? "decimal" : "numeric"} value={display} onChange={handleChange} />;
}
