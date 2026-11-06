import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ClientCombobox } from "../../components/ui/ClientCombobox";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { ClientOption, Contact, ContactInput } from "./types";

const inputCls = "w-full rounded-xl border border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary bg-surface";

/** 연락처 추가/수정 창 (PC·모바일 공용). 회사 칸은 거래처 목록에서 고르거나, 거래처가 아니면 이름만 적는다. 전화번호는 2개까지. */
export function ContactFormModal({ contact, onClose, onSaved }: { contact: Contact | null; onClose: () => void; onSaved: (c: Contact) => void }) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [name, setName] = useState(contact?.name ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [phone2, setPhone2] = useState(contact?.phone2 ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [memo, setMemo] = useState(contact?.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ClientOption[]>("/api/contacts/client-options")
      .then(setClients)
      .catch((err) => logError("Contacts", "거래처 선택 목록 조회 실패", err));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const co = company.trim();
    const matched = clients.find((c) => c.name === co) ?? null; // 거래처 이름과 똑같으면 그 거래처로 연결한다
    const body: ContactInput = {
      name: name.trim(),
      client_id: matched?.id ?? null,
      company_name: matched ? null : co || null,
      title: title.trim() || null,
      phone: phone.trim() || null,
      phone2: phone2.trim() || null,
      email: email.trim() || null,
      memo: memo.trim() || null,
    };
    setBusy(true);
    setError(null);
    try {
      logDebug("Contacts", `${contact ? "수정" : "추가"} 시도: name=${body.name}`);
      const saved = contact ? await apiPut<Contact>(`/api/contacts/${contact.id}`, body) : await apiPost<Contact>("/api/contacts", body);
      onSaved(saved);
    } catch (err) {
      logError("Contacts", "저장 실패", err);
      setError(err instanceof ApiError ? err.message : "저장하지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:px-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md max-h-[92vh] overflow-y-auto space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{contact ? "연락처 수정" : "연락처 추가"}</h3>
          <button type="button" onClick={onClose} className="p-1 -m-1 text-text-muted" aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <label className="block">
          <span className="text-xs text-text-muted">이름 *</span>
          <input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
        </label>
        <div>
          <span className="text-xs text-text-muted">회사 (거래처 목록에서 고르거나 직접 입력)</span>
          <ClientCombobox id="contact-company" value={company} onChange={setCompany} clients={clients.map((c) => ({ ...c, biz_reg_no: null }))} />
        </div>
        <label className="block">
          <span className="text-xs text-text-muted">직책</span>
          <input id="contact-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </label>
        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <span className="text-xs text-text-muted">전화번호 1</span>
            <input id="contact-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">전화번호 2</span>
            <input id="contact-phone2" type="tel" inputMode="tel" value={phone2} onChange={(e) => setPhone2(e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-text-muted">이메일</span>
          <input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-text-muted">메모</span>
          <textarea id="contact-memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className={inputCls} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm">
            취소
          </button>
          <button type="submit" disabled={busy || !name.trim()} className="flex-1 rounded-xl bg-primary text-on-primary py-2.5 text-sm font-semibold disabled:opacity-50">
            {busy ? "저장 중..." : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
