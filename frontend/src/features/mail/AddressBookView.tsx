import { Pencil, Plus, Search, SquarePen, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import type { AddressBookEntry, MailBridge } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { appendContacts } from "./recipientText";

interface Props {
  bridge: MailBridge;
  /** 고른 연락처들에게 메일을 쓴다 (받는 사람 칸에 채워진 글) */
  onCompose: (to: string) => void;
}

interface Draft {
  oldAddress?: string;
  name: string;
  address: string;
  memo: string;
}

const FIELD = "w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm";

/**
 * 주소록 화면: 직접 추가한 연락처와 메일을 보내며 자동으로 올라온 주소를 이름순으로 보여 주고, 검색·추가·수정·삭제하고,
 * 체크한 사람들에게 바로 메일을 쓸 수 있다. 이 PC 에만 저장된다.
 */
export function AddressBookView({ bridge, onCompose }: Props) {
  const dialog = useDialog();
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const request = useRef(0);

  const load = useCallback(
    async (q: string) => {
      const req = ++request.current;
      try {
        const list = await bridge.addressBook(q);
        if (req !== request.current) return; // 그 사이 검색어가 바뀌었다
        setEntries(list);
        setLoaded(true);
        setSelected((prev) => new Set([...prev].filter((a) => list.some((e) => e.address === a))));
      } catch (err) {
        logError("Mail", "주소록을 읽지 못했습니다", err);
        setLoaded(true);
      }
    },
    [bridge],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(query), 120);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  function toggle(address: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const r = await bridge.saveContact({ name: draft.name, address: draft.address, memo: draft.memo, oldAddress: draft.oldAddress });
      if (!r.ok) {
        setFormError(r.error);
        return;
      }
      logDebug("Mail", "연락처 저장");
      setDraft(null);
      await load(query);
    } catch (err) {
      logError("Mail", "연락처를 저장하지 못했습니다", err);
      setFormError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(entry: AddressBookEntry) {
    if (!(await dialog.confirm(`${entry.name || entry.address} 님을 주소록에서 지울까요?`, { okLabel: "지우기", danger: true }))) return;
    await bridge.removeContact(entry.address);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(entry.address);
      return next;
    });
    await load(query);
  }

  const picked = entries.filter((e) => selected.has(e.address));

  return (
    <section className="flex flex-col h-full min-w-0" aria-label="주소록">
      <div className="flex items-center gap-3 px-6 pt-5 pb-3">
        <h1 className="text-lg font-semibold mr-2">주소록</h1>
        <button type="button" onClick={() => { setFormError(null); setDraft({ name: "", address: "", memo: "" }); }} className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2.5">
          <Plus size={15} /> 연락처 추가
        </button>
        <button type="button" disabled={picked.length === 0} onClick={() => onCompose(appendContacts("", picked))} className="flex items-center gap-1.5 rounded-lg border border-border text-sm px-4 py-2.5 hover:bg-bg disabled:opacity-40">
          <SquarePen size={15} /> 선택한 {picked.length}명에게 메일쓰기
        </button>
        <div className="ml-auto relative w-72 max-w-[40%]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름·주소·메모 검색" aria-label="주소록 검색" className={`${FIELD} pl-9`} autoComplete="off" />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto border-t border-border">
        {loaded && entries.length === 0 ? (
          <p className="px-6 py-10 text-sm text-text-muted text-center">
            {query ? "검색 결과가 없습니다." : "주소록이 비어 있습니다. [연락처 추가]를 누르거나, 메일을 보내면 받는 사람이 자동으로 올라옵니다."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-text-muted">
              <tr className="border-b border-border">
                <th className="w-10 px-4 py-2" />
                <th className="text-left font-medium px-2 py-2">이름</th>
                <th className="text-left font-medium px-2 py-2">메일 주소</th>
                <th className="text-left font-medium px-2 py-2">메모</th>
                <th className="w-28 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.address} className="border-b border-border hover:bg-bg">
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={selected.has(e.address)} onChange={() => toggle(e.address)} aria-label={`${e.name || e.address} 선택`} />
                  </td>
                  <td className="px-2 py-2 font-medium max-w-[12rem] truncate" title={e.name}>{e.name || <span className="text-text-muted font-normal">(이름 없음)</span>}</td>
                  <td className="px-2 py-2 max-w-[18rem] truncate" title={e.address}>{e.address}</td>
                  <td className="px-2 py-2 text-text-muted max-w-[16rem] truncate" title={e.memo}>{e.memo}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => onCompose(appendContacts("", [e]))} aria-label={`${e.name || e.address} 에게 메일쓰기`} title="메일쓰기" className="p-1.5 rounded text-text-muted hover:text-primary">
                        <SquarePen size={15} />
                      </button>
                      <button type="button" onClick={() => { setFormError(null); setDraft({ oldAddress: e.address, name: e.name, address: e.address, memo: e.memo }); }} aria-label={`${e.name || e.address} 수정`} title="수정" className="p-1.5 rounded text-text-muted hover:text-primary">
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => void remove(e)} aria-label={`${e.name || e.address} 삭제`} title="삭제" className="p-1.5 rounded text-text-muted hover:text-danger">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label={draft.oldAddress ? "연락처 수정" : "연락처 추가"}>
          <form onSubmit={(e) => void save(e)} className="w-full max-w-md rounded-2xl bg-surface p-6 space-y-3">
            <div className="flex items-start justify-between">
              <h2 className="text-base font-semibold">{draft.oldAddress ? "연락처 수정" : "연락처 추가"}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label="닫기" className="text-text-muted hover:text-text">
                <X size={18} />
              </button>
            </div>
            <label className="block text-sm">
              <span className="text-text-muted text-xs">이름</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={FIELD} autoComplete="off" autoFocus />
            </label>
            <label className="block text-sm">
              <span className="text-text-muted text-xs">메일 주소</span>
              <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} className={FIELD} autoComplete="off" spellCheck={false} />
            </label>
            <label className="block text-sm">
              <span className="text-text-muted text-xs">메모 (회사·직책 등)</span>
              <input value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} className={FIELD} autoComplete="off" />
            </label>
            {formError && (
              <p role="alert" className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-sm text-danger">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg">
                취소
              </button>
              <button type="submit" disabled={saving} className="rounded-lg bg-primary hover:bg-primary-hover text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
