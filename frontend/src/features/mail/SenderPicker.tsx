import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MailBridge, MailIdentitySettings, MailSenderIdentity } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { sameAddress } from "./senderIdentity";

const label = (s: MailSenderIdentity) => (s.name ? `${s.name} <${s.address}>` : s.address);

interface PickerProps {
  options: MailSenderIdentity[];
  value: MailSenderIdentity;
  onChange: (s: MailSenderIdentity) => void;
  onManage: () => void;
}

/** 다음 메일처럼 "이름 <주소> ⌄" 를 누르면 보내는 사람 목록이 펼쳐지고, 맨 아래에서 목록을 관리한다 */
export function SenderPicker({ options, value, onChange, onManage }: PickerProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="보내는 사람 선택"
        className="flex items-center gap-1.5 py-2 max-w-full text-sm hover:text-primary"
      >
        <span className="font-semibold shrink-0">{value.name}</span>
        <span className="text-text-muted truncate">&lt;{value.address}&gt;</span>
        <ChevronDown size={15} className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label="보내는 사람 목록" className="absolute left-0 top-full z-20 mt-1 w-[26rem] max-w-[90vw] rounded-lg border border-border bg-surface shadow-lg py-2">
          {options.map((o) => (
            <button
              key={o.address}
              type="button"
              role="option"
              aria-selected={sameAddress(o.address, value.address)}
              onClick={() => {
                logDebug("Mail", `보내는 사람 선택: ${o.address}`);
                onChange(o);
                setOpen(false);
              }}
              className={`block w-full text-left px-4 py-2.5 text-sm truncate hover:bg-bg ${sameAddress(o.address, value.address) ? "bg-bg font-medium" : ""}`}
            >
              {label(o)}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
            className="block w-full text-left px-4 py-2.5 text-sm text-text-muted hover:bg-bg"
          >
            보내는 사람 추가 / 관리 &gt;
          </button>
        </div>
      )}
    </div>
  );
}

interface ManagerProps {
  bridge: MailBridge;
  settings: MailIdentitySettings;
  account: MailSenderIdentity;
  onSaved: (s: MailIdentitySettings) => void;
  onClose: () => void;
}

/** 보내는 사람 목록을 추가·고치기·지우기·기본 정하기 (이 PC 에만 저장된다) */
export function SenderManager({ bridge, settings, account, onSaved, onClose }: ManagerProps) {
  const [rows, setRows] = useState<MailSenderIdentity[]>(settings.items.map((i) => ({ ...i })));
  const [defaultAddress, setDefaultAddress] = useState(settings.defaultAddress);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<MailSenderIdentity>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await bridge.saveIdentities({ items: rows, defaultAddress });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onSaved(r.value);
    } catch (err) {
      logError("Mail", "보내는 사람 목록 저장 실패", err);
      setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="보내는 사람 관리">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-surface p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-semibold">보내는 사람 관리</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">
          메일을 보낼 때 고를 이름과 주소입니다. 이 PC 에만 저장됩니다. 메일 서버가 허용하는 주소(내 계정이거나 서버에 별칭으로 등록된 주소)만 실제로 보낼 수 있고, 허용하지 않으면 보낼 때 안내가 나옵니다.
        </p>

        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm">
            <label className="flex items-center gap-1.5 shrink-0 text-xs">
              <input type="radio" name="default-sender" checked={defaultAddress === ""} onChange={() => setDefaultAddress("")} aria-label="로그인 계정을 기본으로" />
              기본
            </label>
            <span className="min-w-0 truncate">
              {account.name} &lt;{account.address}&gt;
            </span>
            <span className="ml-auto text-xs text-text-muted shrink-0">로그인한 계정</span>
          </div>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 shrink-0 text-xs">
                <input type="radio" name="default-sender" checked={row.address !== "" && sameAddress(row.address, defaultAddress)} onChange={() => setDefaultAddress(row.address.trim())} disabled={row.address.trim() === ""} aria-label={`${row.address || "새 주소"} 를 기본으로`} />
                기본
              </label>
              <input value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="이름" aria-label={`이름 ${i + 1}`} className="w-32 shrink-0 rounded-lg border border-border px-3 py-2 text-sm" autoComplete="off" />
              <input
                value={row.address}
                onChange={(e) => {
                  if (sameAddress(row.address, defaultAddress)) setDefaultAddress(e.target.value.trim()); // 기본으로 정한 주소를 고치면 기본도 따라간다
                  update(i, { address: e.target.value });
                }}
                placeholder="메일 주소"
                aria-label={`주소 ${i + 1}`}
                className="flex-1 min-w-0 rounded-lg border border-border px-3 py-2 text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => {
                  if (sameAddress(row.address, defaultAddress)) setDefaultAddress("");
                  setRows((r) => r.filter((_, k) => k !== i));
                }}
                aria-label={`${row.address || "새 주소"} 지우기`}
                className="p-2 text-text-muted hover:text-danger shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setRows((r) => [...r, { name: account.name, address: "" }])} disabled={rows.length >= 20} className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50">
          <Plus size={14} /> 보내는 사람 추가
        </button>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg">
            취소
          </button>
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-lg bg-primary hover:bg-primary-hover text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
            {busy ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
