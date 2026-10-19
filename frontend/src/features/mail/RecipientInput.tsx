import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { MailBridge, MailContact } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { applyContact, currentTokenStart, extractEmails } from "./recipientText";

const MAX_SHOWN = 8;

interface Props {
  id: string;
  bridge: MailBridge;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className: string;
}

/**
 * 받는 사람 입력칸 + 자동완성. 칸을 누르거나 글을 쓰면, 메일을 보낸 적 있는 주소가 최근 순(입력한 글이 있으면 이름·주소에 맞는 것)으로 나타나
 * 골라 넣을 수 있다. 이미 입력한 주소는 후보에서 빼고, 후보 오른쪽 ×로 주소록에서 지울 수 있다.
 */
export function RecipientInput({ id, bridge, value, onChange, placeholder, autoFocus, className }: Props) {
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MailContact[]>([]);
  const [active, setActive] = useState(-1);

  const token = value.slice(currentTokenStart(value)).trim();
  const already = new Set(extractEmails(value.slice(0, currentTokenStart(value))).map((a) => a.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const req = ++request.current;
    const timer = window.setTimeout(() => {
      bridge
        .contacts(token, MAX_SHOWN + already.size)
        .then((list) => {
          if (req !== request.current) return; // 그 사이 글이 바뀌었다
          setItems(list.filter((c) => !already.has(c.address.toLowerCase())).slice(0, MAX_SHOWN));
          setActive(-1);
        })
        .catch((err) => logError("Mail", "주소록을 읽지 못했습니다", err));
    }, 60);
    return () => window.clearTimeout(timer);
    // already 는 value 에서 계산되므로 value 가 바뀔 때 함께 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, value, bridge]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(c: MailContact) {
    logDebug("Mail", "받는 사람 자동완성 선택");
    onChange(applyContact(value, c));
    setActive(-1);
  }

  async function remove(c: MailContact) {
    try {
      await bridge.removeContact(c.address);
      setItems((prev) => prev.filter((x) => x.address !== c.address));
    } catch (err) {
      logError("Mail", "주소록에서 지우지 못했습니다", err);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && open) {
      setOpen(false);
      return;
    }
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % items.length : (a - 1 + items.length) % items.length));
    } else if ((e.key === "Enter" || e.key === "Tab") && active >= 0) {
      e.preventDefault(); // 고르는 중의 Enter 가 메일 보내기로 넘어가지 않게
      pick(items[active]);
    }
  }

  const shown = open && items.length > 0;
  return (
    <div ref={box} className="relative flex-1 min-w-0">
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {shown && (
        <ul id={listId} role="listbox" aria-label="보낸 적 있는 주소" className="absolute left-0 top-full z-20 mt-1 w-[28rem] max-w-[90vw] max-h-72 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg py-1">
          {items.map((c, i) => (
            <li key={c.address} role="option" aria-selected={i === active} className={`flex items-center gap-1 ${i === active ? "bg-bg" : ""}`}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()} // 칸에서 포커스가 빠지지 않게
                onClick={() => pick(c)}
                className="flex-1 min-w-0 text-left px-4 py-2 text-sm hover:bg-bg truncate"
              >
                {c.name ? (
                  <>
                    <span className="font-medium">{c.name}</span> <span className="text-text-muted">&lt;{c.address}&gt;</span>
                  </>
                ) : (
                  c.address
                )}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void remove(c)}
                aria-label={`${c.address} 주소록에서 지우기`}
                title="주소록에서 지우기"
                className="p-2 text-text-muted hover:text-danger shrink-0"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
