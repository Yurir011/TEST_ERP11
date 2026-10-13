import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface ClientOption {
  id: number;
  name: string;
  biz_reg_no: string | null;
}

/** 거래처명 콤보박스. 누르면 등록된 거래처 전체가 목록으로 뜨고, 글자를 입력하면 포함된 거래처만 남는다.
 *  등록되지 않은 이름도 직접 입력할 수 있다. */
export function ClientCombobox({
  value,
  onChange,
  clients,
  required,
  id,
}: {
  value: string;
  onChange: (name: string) => void;
  clients: ClientOption[];
  required?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typing, setTyping] = useState(false); // 입력 중일 때만 필터링한다 (처음 열면 전체 목록)
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  const options = useMemo(() => {
    if (!typing || !q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || (c.biz_reg_no ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000"));
  }, [clients, q, typing]);

  useEffect(() => {
    setActive(-1);
  }, [value, open]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(c: ClientOption) {
    console.debug(`[ClientCombobox] 거래처 선택: id=${c.id}, name=${c.name}`);
    onChange(c.name);
    setTyping(false);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      e.preventDefault();
      e.stopPropagation();
      pick(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        required={required}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setTyping(true);
          setOpen(true);
        }}
        onFocus={() => {
          setTyping(false);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="거래처 선택 또는 직접 입력"
        className="w-full rounded-lg border border-border pl-3 pr-8 py-2 text-sm outline-none focus:border-primary bg-bg"
      />
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-muted">일치하는 거래처가 없습니다. 입력한 이름 그대로 사용됩니다.</p>
          ) : (
            options.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className={`flex w-full items-center justify-between gap-3 text-left px-3 py-1.5 text-sm ${
                  i === active ? "bg-tile-blue text-tile-blue-fg" : "hover:bg-bg"
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-[11px] text-text-muted shrink-0">{c.biz_reg_no ?? "사업자번호 미등록"}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
