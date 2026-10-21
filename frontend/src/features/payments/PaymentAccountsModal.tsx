import { CreditCard, Landmark, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { refreshPaymentAccounts, usePaymentAccounts, type AccountKind, type PaymentAccount } from "./paymentAccounts";

interface FormState {
  id: number | null; // null 이면 새로 추가
  kind: AccountKind;
  nickname: string;
  issuer: string;
  last4: string;
  payDay: string;
  isActive: boolean;
}

const emptyForm = (kind: AccountKind): FormState => ({ id: null, kind, nickname: "", issuer: "", last4: "", payDay: kind === "card" ? "15" : "", isActive: true });

const fromAccount = (a: PaymentAccount): FormState => ({
  id: a.id,
  kind: a.kind,
  nickname: a.nickname,
  issuer: a.issuer,
  last4: a.last4 ?? "",
  payDay: a.pay_day ? String(a.pay_day) : "",
  isActive: a.is_active,
});

const inputClass = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary";

/**
 * 법인카드·계좌 관리 (관리자). 카드사·뒤 4자리·별명을 정해 추가하고, 이름을 고치거나 지운다.
 * 평소 화면에는 별명만 보이고, 누르면 카드사와 뒤 4자리를 확인할 수 있다.
 * 사용 내역이 있는 수단은 지우면 목록에서만 숨겨지고 옛 내역의 이름은 그대로 보인다.
 */
export function PaymentAccountsModal({ onClose }: { onClose: () => void }) {
  const { confirm, notify } = useDialog();
  const { all } = usePaymentAccounts();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshPaymentAccounts(); // 열 때마다 최신 목록 (사용 중 여부 포함)
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    const body = {
      nickname: form.nickname.trim(),
      issuer: form.issuer.trim(),
      last4: form.last4.trim() || null,
      pay_day: form.kind === "card" && form.payDay ? Number(form.payDay) : null,
    };
    if (!body.nickname || !body.issuer) {
      setError("별명과 카드사(은행)를 입력해주세요.");
      return;
    }
    if (body.last4 && !/^\d{4}$/.test(body.last4)) {
      setError("뒤 4자리는 숫자 4개로 입력해주세요.");
      return;
    }
    setSaving(true);
    logDebug("PaymentAccounts", `${form.id === null ? "추가" : "수정"}: kind=${form.kind}, nickname=${body.nickname}`);
    try {
      if (form.id === null) await apiPost("/api/payment-accounts", { kind: form.kind, ...body });
      else await apiPut(`/api/payment-accounts/${form.id}`, { ...body, is_active: form.isActive });
      await refreshPaymentAccounts();
      setForm(null);
    } catch (err) {
      logError("PaymentAccounts", "저장 실패", err);
      setError(err instanceof ApiError ? err.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(a: PaymentAccount) {
    const message = a.in_use
      ? `'${a.nickname}'은(는) 입출금 내역에 쓰인 적이 있어 지우지 않고 목록에서 숨깁니다. 옛 내역의 이름은 그대로 보입니다. 숨길까요?`
      : `'${a.nickname}'을(를) 삭제할까요?`;
    if (!(await confirm(message, { okLabel: a.in_use ? "숨기기" : "삭제", danger: true }))) return;
    logDebug("PaymentAccounts", `삭제: id=${a.id}, in_use=${a.in_use}`);
    try {
      await apiDelete(`/api/payment-accounts/${a.id}`);
      await refreshPaymentAccounts();
      if (a.in_use) notify(`'${a.nickname}'을(를) 목록에서 숨겼습니다.`);
    } catch (err) {
      logError("PaymentAccounts", "삭제 실패", err);
      setError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  const section = (kind: AccountKind, title: string, icon: React.ReactNode) => {
    const rows = all.filter((a) => a.kind === kind);
    return (
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            {icon}
            {title}
          </h3>
          <button type="button" onClick={() => setForm(emptyForm(kind))} className="text-xs rounded-lg border border-border px-2.5 py-1 hover:bg-bg">
            + {kind === "card" ? "카드" : "계좌"} 추가
          </button>
        </div>
        {rows.length === 0 && <p className="rounded-lg bg-bg px-3 py-2 text-xs text-text-muted">등록된 {kind === "card" ? "카드" : "계좌"}가 없습니다.</p>}
        <ul className="flex flex-col gap-1.5">
          {rows.map((a) => (
            <li key={a.id} className={`flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm ${a.is_active ? "bg-surface" : "bg-bg opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {a.nickname}
                  {!a.is_active && <span className="ml-1.5 rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-normal">숨김</span>}
                </p>
                <p className="text-xs text-text-muted tabular-nums">
                  {a.issuer}
                  {a.last4 ? ` · ····${a.last4}` : ""}
                  {a.kind === "card" && a.pay_day ? ` · 매월 ${a.pay_day}일 결제` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setForm(fromAccount(a))} aria-label={`${a.nickname} 수정`} title="수정" className="p-1.5 rounded-md text-text-muted hover:bg-bg hover:text-text">
                <Pencil size={14} />
              </button>
              {a.is_active && (
                <button type="button" onClick={() => handleDelete(a)} aria-label={`${a.nickname} 삭제`} title={a.in_use ? "숨기기" : "삭제"} className="p-1.5 rounded-md text-text-muted hover:bg-bg hover:text-danger">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="카드·계좌 관리" className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-surface border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">카드·계좌 관리</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              화면에는 별명만 보이고, 이름을 눌러 카드사와 뒤 4자리를 확인합니다. 새 카드·계좌를 추가하면 입출금·정기 자동이체·품의서 결제에서 고를 수 있습니다.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded text-text-muted hover:bg-bg hover:text-text">
            <X size={16} />
          </button>
        </div>

        {error && !form && <p className="mb-2 text-xs text-danger">{error}</p>}

        {form && (
          <form onSubmit={handleSave} className="mb-5 flex flex-col gap-2.5 rounded-xl border border-primary/40 bg-bg p-3">
            <p className="text-sm font-medium">
              {form.kind === "card" ? "카드" : "계좌"} {form.id === null ? "추가" : "수정"}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="text-xs text-text-muted">
                별명 (화면에 보이는 이름)
                <input value={form.nickname} onChange={(e) => patch({ nickname: e.target.value })} maxLength={50} aria-label="별명" placeholder={form.kind === "card" ? "예: 대표님 카드" : "예: 월급 통장"} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="text-xs text-text-muted">
                {form.kind === "card" ? "카드사" : "은행"}
                <input value={form.issuer} onChange={(e) => patch({ issuer: e.target.value })} maxLength={50} aria-label={form.kind === "card" ? "카드사" : "은행"} placeholder={form.kind === "card" ? "예: 신한카드" : "예: 하나은행"} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="text-xs text-text-muted">
                {form.kind === "card" ? "카드번호" : "계좌번호"} 뒤 4자리
                <input value={form.last4} onChange={(e) => patch({ last4: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" maxLength={4} aria-label="뒤 4자리" placeholder="1234" className={`mt-1 ${inputClass}`} />
              </label>
              {form.kind === "card" && (
                <label className="text-xs text-text-muted">
                  결제일 (매월)
                  <input type="number" min={1} max={31} value={form.payDay} onChange={(e) => patch({ payDay: e.target.value })} aria-label="결제일" className={`mt-1 ${inputClass}`} />
                </label>
              )}
            </div>
            {form.id !== null && (
              <label className="flex items-center gap-2 text-xs text-text-muted">
                <input type="checkbox" checked={form.isActive} onChange={(e) => patch({ isActive: e.target.checked })} className="accent-primary" />
                목록에 표시 (끄면 새 입출금에서 고를 수 없고, 옛 내역의 이름은 그대로 보입니다)
              </label>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface">
                취소
              </button>
              <button type="submit" disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50">
                저장
              </button>
            </div>
          </form>
        )}

        {section("card", "법인카드", <CreditCard size={15} />)}
        {section("bank", "계좌", <Landmark size={15} />)}
      </div>
    </div>
  );
}
