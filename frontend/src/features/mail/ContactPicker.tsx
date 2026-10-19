import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AddressBookEntry, MailBridge } from "../../lib/desktop";
import { logError } from "../../lib/logger";

export type RecipientField = "to" | "cc" | "bcc";

interface Props {
  bridge: MailBridge;
  onPick: (field: RecipientField, contacts: AddressBookEntry[]) => void;
  onClose: () => void;
}

/** 메일쓰기에서 주소록을 열어 여러 사람을 체크하고 받는 사람·참조·숨은참조 중 한 곳에 한꺼번에 넣는다 */
export function ContactPicker({ bridge, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [known, setKnown] = useState<Map<string, AddressBookEntry>>(new Map()); // 검색으로 목록에서 사라져도 체크한 사람을 기억한다
  const request = useRef(0);

  useEffect(() => {
    const req = ++request.current;
    const timer = window.setTimeout(() => {
      bridge
        .addressBook(query)
        .then((list) => {
          if (req !== request.current) return;
          setEntries(list);
          setKnown((prev) => {
            const next = new Map(prev);
            list.forEach((e) => next.set(e.address, e));
            return next;
          });
          setLoaded(true);
        })
        .catch((err) => {
          logError("Mail", "주소록을 읽지 못했습니다", err);
          setLoaded(true);
        });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [bridge, query]);

  const toggle = (address: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });

  const picked = [...selected].map((a) => known.get(a)).filter((e): e is AddressBookEntry => !!e);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="주소록에서 받는 사람 고르기">
      <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl bg-surface p-6">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-base font-semibold">주소록</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름·주소·메모 검색" aria-label="주소록 검색" className="w-full rounded-lg border border-border bg-transparent pl-9 pr-3 py-2 text-sm" autoComplete="off" autoFocus />
        </div>
        <ul className="flex-1 min-h-[12rem] overflow-y-auto rounded-lg border border-border divide-y divide-border" aria-label="주소록 목록">
          {loaded && entries.length === 0 && <li className="px-4 py-8 text-center text-sm text-text-muted">{query ? "검색 결과가 없습니다." : "주소록이 비어 있습니다."}</li>}
          {entries.map((e) => (
            <li key={e.address}>
              <label className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-bg cursor-pointer">
                <input type="checkbox" checked={selected.has(e.address)} onChange={() => toggle(e.address)} aria-label={`${e.name || e.address} 선택`} />
                <span className="min-w-0 flex-1 truncate">
                  {e.name && <span className="font-medium">{e.name} </span>}
                  <span className={e.name ? "text-text-muted" : ""}>{e.name ? `<${e.address}>` : e.address}</span>
                  {e.memo && <span className="text-text-muted"> · {e.memo}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted mr-auto">{picked.length}명 선택</span>
          {(["to", "cc", "bcc"] as const).map((f) => (
            <button key={f} type="button" disabled={picked.length === 0} onClick={() => onPick(f, picked)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg disabled:opacity-40">
              {f === "to" ? "받는사람에 추가" : f === "cc" ? "참조에 추가" : "숨은참조에 추가"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
