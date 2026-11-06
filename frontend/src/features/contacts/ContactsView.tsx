import { Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { ClientPopup } from "./ClientPopup";
import { ContactFormModal } from "./ContactFormModal";
import { telHref, type Contact } from "./types";

/** 연락처 목록·검색·추가·수정·삭제 (PC 화면과 모바일 화면이 같이 쓴다. 내용은 전 직원이 공유한다). */
export function ContactsView() {
  const dialog = useDialog();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [popupClient, setPopupClient] = useState<number | null>(null);

  const load = useCallback(
    (q: string) => {
      logDebug("Contacts", `목록 조회: q=${q}`);
      apiGet<Contact[]>(`/api/contacts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
        .then(setContacts)
        .catch((err) => {
          logError("Contacts", "목록 조회 실패", err);
          setContacts([]);
        });
    },
    [],
  );

  // 검색어를 칠 때마다 바로 부르지 않고 잠깐 기다린다
  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  async function remove(c: Contact) {
    if (!(await dialog.confirm(`'${c.name}' 연락처를 삭제할까요?\n모든 직원의 연락처에서 사라집니다.`, { okLabel: "삭제", danger: true }))) return;
    try {
      await apiDelete(`/api/contacts/${c.id}`);
      load(query);
    } catch (err) {
      logError("Contacts", "삭제 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            id="contact-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름, 회사, 전화번호 검색"
            aria-label="연락처 검색"
            className="w-full rounded-xl border border-border pl-10 pr-3 py-3 text-base sm:text-sm outline-none focus:border-primary bg-surface"
          />
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-primary text-on-primary px-4 text-sm font-semibold"
        >
          <Plus size={16} />
          추가
        </button>
      </div>

      {contacts === null ? (
        <p className="text-xs text-text-muted text-center py-10">불러오는 중...</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-10">{query ? "검색 결과가 없습니다." : "등록된 연락처가 없습니다. 오른쪽 위 '추가'로 등록하세요."}</p>
      ) : (
        <>
          <p className="text-xs text-text-muted px-1">{contacts.length}명</p>
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="bg-surface border border-border rounded-2xl p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold break-words">
                      {c.name}
                      {c.title && <span className="text-xs text-text-muted font-normal"> {c.title}</span>}
                      {c.company &&
                        (c.client_id !== null ? (
                          <button
                            type="button"
                            onClick={() => setPopupClient(c.client_id)}
                            className="ml-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {c.company}
                          </button>
                        ) : (
                          <span className="ml-2 text-xs font-normal text-text-muted">{c.company}</span>
                        ))}
                    </p>
                    <div className="flex flex-col gap-1 mt-2 text-sm">
                      {[c.phone, c.phone2].map(
                        (n) =>
                          n && (
                            <a key={n} href={telHref(n)} className="inline-flex items-center gap-1.5 text-primary tabular-nums w-fit">
                              <Phone size={13} />
                              {n}
                            </a>
                          ),
                      )}
                      {c.email && <span className="text-xs text-text-muted break-all">{c.email}</span>}
                      {c.memo && <span className="text-xs text-text-muted whitespace-pre-wrap">{c.memo}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0">
                    <button type="button" onClick={() => setEditing(c)} className="p-2 text-text-muted hover:text-text" aria-label={`${c.name} 수정`}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" onClick={() => void remove(c)} className="p-2 text-text-muted hover:text-danger" aria-label={`${c.name} 삭제`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <ContactFormModal
          contact={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load(query);
          }}
        />
      )}
      {popupClient !== null && <ClientPopup clientId={popupClient} onClose={() => setPopupClient(null)} />}
    </div>
  );
}
