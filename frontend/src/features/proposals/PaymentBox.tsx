import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { usePaymentAccounts } from "../payments/paymentAccounts";
import type { Proposal, ProposalPayment } from "./types";

const won = (n: number) => `₩${n.toLocaleString()}`;
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "");

/** "2026-10-22" → "10-22" */
const shortDate = (d: string) => d.slice(5, 10);

const METHOD_LABELS: Record<string, string> = { deposit: "입금", card: "법인카드", cash: "현금", other: "기타" };

/**
 * 발주 건의 결제 내역(부분 결제): 결제를 나눠서 여러 번 추가하고, 합계(부가세 포함)를 다 채우면 결제 완료가 된다.
 * 추가·삭제는 입출금관리의 출금에 바로 반영된다. 결제를 바꿀 수 있는 사람은 품의서 작성자와 관리자뿐이다.
 */
export function PaymentBox({ proposal, canManage, onChanged }: { proposal: Proposal; canManage: boolean; onChanged: (updated: Proposal) => void }) {
  const { banks, cards, bankName, cardName } = usePaymentAccounts();
  const { confirm } = useDialog();
  const payments: ProposalPayment[] = proposal.payments ?? [];
  const total = proposal.payable_total ?? null;
  const paid = payments.reduce((sum, x) => sum + x.amount, 0);
  const rest = total === null ? 0 : Math.max(0, total - paid);

  const [method, setMethod] = useState<"deposit" | "card">("deposit");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState(String(rest));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 결제가 추가·삭제되면 금액 칸을 새 잔액으로 다시 채운다
  useEffect(() => {
    setAmount(String(rest));
  }, [rest]);

  const options = method === "deposit" ? banks : cards;
  const selectedAccount = options.some((a) => a.code === account) ? account : (options[0]?.code ?? "");

  if (total === null) return null; // 발주 완료 전이거나 원화가 아니면 결제 내역을 관리하지 않는다

  const label = (x: ProposalPayment) => {
    const name = x.method === "deposit" ? bankName(x.account) : x.method === "card" ? cardName(x.account) : "";
    return `${METHOD_LABELS[x.method] ?? "기타"}${name ? ` · ${name}` : ""}`;
  };

  async function handleAdd() {
    const value = Number(digitsOnly(amount));
    if (!value || value <= 0) {
      setError("결제 금액을 입력해 주세요.");
      return;
    }
    if (value > rest) {
      setError(`잔액(${won(rest)})보다 큰 금액은 결제할 수 없습니다.`);
      return;
    }
    if (!selectedAccount) {
      setError(method === "deposit" ? "입금 계좌를 골라 주세요. (카드·계좌 관리에서 추가)" : "법인카드를 골라 주세요. (카드·계좌 관리에서 추가)");
      return;
    }
    setError(null);
    setBusy(true);
    logDebug("PaymentBox", `결제 추가 시도: proposal_id=${proposal.id}, method=${method}, amount=${value}`);
    try {
      onChanged(await apiPost<Proposal>(`/api/proposals/${proposal.id}/payments`, { payment_method: method, account: selectedAccount, amount: value }));
    } catch (err) {
      logError("PaymentBox", "결제 추가 실패", err);
      setError(err instanceof ApiError ? err.message : "결제를 추가하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(x: ProposalPayment) {
    if (!(await confirm(`${shortDate(x.payment_date)} ${label(x)} ${won(x.amount)} 결제를 삭제할까요? 입출금관리의 출금도 함께 지워집니다.`, { okLabel: "삭제", danger: true }))) return;
    setError(null);
    setBusy(true);
    logDebug("PaymentBox", `결제 삭제 시도: proposal_id=${proposal.id}, payment_id=${x.id}`);
    try {
      onChanged(await apiDelete<Proposal>(`/api/proposals/${proposal.id}/payments/${x.id}`));
    } catch (err) {
      logError("PaymentBox", "결제 삭제 실패", err);
      setError(err instanceof ApiError ? err.message : "결제를 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const status =
    paid === 0
      ? { text: "미결제 (외상)", tone: "bg-bg text-text-muted" }
      : rest > 0
        ? { text: "부분 결제", tone: "bg-tile-blue text-tile-blue-fg" }
        : { text: "결제 완료", tone: "bg-tile-green text-tile-green-fg" };
  const ratio = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const canAdd = canManage && rest > 0;

  return (
    <section aria-label="결제 내역" className="flex w-full flex-col gap-2.5 rounded-xl border border-[#b4b3b9] bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-text-muted">결제</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${status.tone}`}>{status.text}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={paid} aria-label="결제 진행">
        <i className={`block h-full ${rest === 0 ? "bg-tile-green-fg" : "bg-primary"}`} style={{ width: `${ratio}%` }} />
      </div>

      <ul className="border-t border-border">
        {payments.length === 0 && <li className="py-2 text-xs text-text-muted">결제 내역이 없습니다. 외상(미지급)으로 남아 있습니다.</li>}
        {payments.map((x, i) => (
          <li key={x.id} className="grid grid-cols-[3.5rem_1fr_auto_1.25rem] items-center gap-2 border-b border-border py-1.5 text-xs">
            <span className="tabular-nums text-text-muted">{shortDate(x.payment_date)}</span>
            <span className="min-w-0 truncate">{label(x)}</span>
            <span className="font-bold tabular-nums">{won(x.amount)}</span>
            {canManage && (rest > 0 || i === payments.length - 1) ? (
              <button type="button" onClick={() => void handleRemove(x)} disabled={busy} aria-label={`${label(x)} ${won(x.amount)} 삭제`} title="삭제" className="text-text-muted hover:text-danger disabled:opacity-50">
                <X size={14} />
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>

      {canAdd && (
        <div className="grid grid-cols-2 gap-1.5">
          <select aria-label="결제 방법" value={method} onChange={(e) => setMethod(e.target.value as "deposit" | "card")} className="min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-primary">
            <option value="deposit">입금</option>
            <option value="card">법인카드</option>
          </select>
          <select aria-label={method === "deposit" ? "입금 계좌" : "법인카드"} value={selectedAccount} onChange={(e) => setAccount(e.target.value)} className="min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-primary">
            {options.map((a) => (
              <option key={a.code} value={a.code}>
                {a.nickname}
              </option>
            ))}
          </select>
          <input
            aria-label="결제 금액"
            inputMode="numeric"
            value={amount === "" ? "" : Number(digitsOnly(amount)).toLocaleString()}
            onChange={(e) => setAmount(digitsOnly(e.target.value))}
            className="col-span-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-right text-xs font-bold tabular-nums outline-none focus:border-primary"
          />
          <button type="button" onClick={() => void handleAdd()} disabled={busy} className="col-span-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50">
            결제 추가
          </button>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-border pt-2 text-xs text-text-muted">
        <span>
          결제 {won(paid)} <span className="text-[11px]">/ {won(total)} (부가세 포함)</span>
        </span>
        <span>
          잔액 <b className={`text-sm tabular-nums ${rest === 0 ? "text-tile-green-fg" : "text-primary"}`}>{won(rest)}</b>
        </span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <p className="text-[11px] text-text-muted">{canManage ? "추가·삭제하면 입출금관리에 바로 반영됩니다." : "작성자와 관리자만 결제를 바꿀 수 있습니다."}</p>
    </section>
  );
}
