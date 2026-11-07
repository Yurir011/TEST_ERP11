import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { refreshPaymentAccounts, usePaymentAccounts, type PaymentAccount } from "./paymentAccounts";
import { useCardStaff, type CardStaff } from "./useCardStaff";

function CardRow({ account, staff, onSaved }: { account: PaymentAccount; staff: CardStaff[]; onSaved: () => void }) {
  const { notify } = useDialog();
  const [ids, setIds] = useState<number[]>(account.delegate_ids);
  const [saving, setSaving] = useState(false);
  const dirty = ids.length !== account.delegate_ids.length || ids.some((i) => !account.delegate_ids.includes(i));
  const candidates = staff.filter((s) => s.id !== account.owner_user_id);

  async function save() {
    setSaving(true);
    logDebug("CardAccess", `사용 권한 저장: account_id=${account.id}, user_ids=${ids.join(",")}`);
    try {
      await apiPut(`/api/payment-accounts/${account.id}/delegates`, { user_ids: ids });
      await refreshPaymentAccounts();
      onSaved();
    } catch (err) {
      logError("CardAccess", "사용 권한 저장 실패", err);
      notify(err instanceof ApiError ? err.message : "사용 권한을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <p className="text-sm font-medium">
        {account.nickname}
        <span className="ml-2 text-xs font-normal text-text-muted tabular-nums">
          {account.issuer}
          {account.last4 ? ` · ····${account.last4}` : ""} · 소유 {account.owner_name ?? "공용"}
        </span>
      </p>
      <p className="mt-1 text-xs text-text-muted">체크한 직원은 이 카드의 사용 내역을 등록·수정할 수 있습니다. (소유 직원과 관리자는 항상 가능)</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {candidates.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm cursor-pointer hover:bg-bg">
            <input
              type="checkbox"
              checked={ids.includes(s.id)}
              onChange={(e) => setIds((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((i) => i !== s.id)))}
              className="accent-primary"
            />
            {s.name}
          </label>
        ))}
        {candidates.length === 0 && <span className="text-xs text-text-muted">허용할 수 있는 직원이 없습니다.</span>}
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </li>
  );
}

/** 법인카드 사용 권한: 카드 소유 직원과 관리자가, 다른 직원에게 그 카드의 사용 내역 등록·수정을 허용하거나 회수한다. */
export function CardAccessModal({ onClose }: { onClose: () => void }) {
  const { cards } = usePaymentAccounts();
  const staff = useCardStaff();
  const manageable = cards.filter((c) => c.can_manage);

  useEffect(() => {
    void refreshPaymentAccounts();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label="법인카드 사용 권한" className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">법인카드 사용 권한</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded text-text-muted hover:bg-bg hover:text-text">
            <X size={16} />
          </button>
        </div>
        <ul className="flex flex-col gap-2.5 overflow-y-auto min-h-0">
          {manageable.length === 0 && <li className="rounded-lg bg-bg px-3 py-2 text-xs text-text-muted">권한을 정할 수 있는 법인카드가 없습니다.</li>}
          {manageable.map((c) => (
            <CardRow key={`${c.id}:${c.delegate_ids.join(",")}`} account={c} staff={staff} onSaved={() => undefined} />
          ))}
        </ul>
      </div>
    </div>
  );
}
