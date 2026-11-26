import { Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { NumberInput } from "../../components/ui/NumberInput";
import { ApiError, apiDelete, apiPost, apiPut } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { usePaymentAccounts } from "../payments/paymentAccounts";
import type { Proposal, ProposalPayment } from "./types";

const won = (n: number) => `₩${n.toLocaleString()}`;
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "");

/** "2026-10-22" → "10-22" */
const shortDate = (d: string) => d.slice(5, 10);

const METHOD_LABELS: Record<string, string> = { deposit: "송금", card: "법인카드", cash: "현금", other: "기타" };

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
  const [payDate, setPayDate] = useState(todayISO()); // 새 결제의 결제일
  // 줄 안에서 고치는 중인 결제
  const [editId, setEditId] = useState<number | null>(null);
  const [eDate, setEDate] = useState("");
  const [eMethod, setEMethod] = useState<"deposit" | "card">("deposit");
  const [eAccount, setEAccount] = useState("");
  const [eAmount, setEAmount] = useState("");

  // 결제가 추가·삭제되면 금액 칸을 새 잔액으로 다시 채운다
  useEffect(() => {
    setAmount(String(rest));
  }, [rest]);

  const options = method === "deposit" ? banks : cards;
  const selectedAccount = options.some((a) => a.code === account) ? account : (options[0]?.code ?? "");

  // 외화(달러·엔) 구매는 발주 완료 뒤 실결제 원화 금액·환율을 수기로 입력해야 결제 내역이 만들어진다.
  const foreignBox =
    proposal.currency && proposal.currency !== "KRW" && proposal.order_sent_at ? (
      <ForeignSettleBox proposal={proposal} canManage={canManage} onChanged={onChanged} />
    ) : null;
  if (total === null) return foreignBox; // 발주 완료 전이거나 외화 실결제 금액 입력 전이면 결제 내역을 관리하지 않는다

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
      setError(method === "deposit" ? "송금 계좌를 골라 주세요. (카드·계좌 관리에서 추가)" : "법인카드를 골라 주세요. (카드·계좌 관리에서 추가)");
      return;
    }
    setError(null);
    setBusy(true);
    logDebug("PaymentBox", `결제 추가 시도: proposal_id=${proposal.id}, method=${method}, amount=${value}`);
    try {
      onChanged(await apiPost<Proposal>(`/api/proposals/${proposal.id}/payments`, { payment_method: method, account: selectedAccount, amount: value, payment_date: payDate }));
    } catch (err) {
      logError("PaymentBox", "결제 추가 실패", err);
      setError(err instanceof ApiError ? err.message : "결제를 추가하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(x: ProposalPayment) {
    setError(null);
    setEditId(x.id);
    setEDate(x.payment_date.slice(0, 10));
    setEMethod(x.method === "card" ? "card" : "deposit");
    setEAccount(x.account ?? "");
    setEAmount(String(x.amount));
  }

  async function handleSaveEdit(x: ProposalPayment) {
    const value = Number(digitsOnly(eAmount));
    if (!value || value <= 0) {
      setError("결제 금액을 입력해 주세요.");
      return;
    }
    const acct = (eMethod === "deposit" ? banks : cards).some((a) => a.code === eAccount) ? eAccount : ((eMethod === "deposit" ? banks : cards)[0]?.code ?? "");
    if (!acct) {
      setError(eMethod === "deposit" ? "송금 계좌를 골라 주세요." : "법인카드를 골라 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    logDebug("PaymentBox", `결제 수정 시도: proposal_id=${proposal.id}, payment_id=${x.id}, amount=${value}, date=${eDate}`);
    try {
      onChanged(await apiPut<Proposal>(`/api/proposals/${proposal.id}/payments/${x.id}`, { payment_method: eMethod, account: acct, amount: value, payment_date: eDate }));
      setEditId(null);
    } catch (err) {
      logError("PaymentBox", "결제 수정 실패", err);
      setError(err instanceof ApiError ? err.message : "결제를 수정하지 못했습니다.");
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
    <>
    {foreignBox}
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
        {payments.map((x, i) =>
          editId === x.id ? (
            <li key={x.id} className="flex flex-col gap-2 border-b border-border bg-tile-blue/40 px-1.5 py-2 text-xs" aria-label="결제 수정">
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5 text-text-muted">
                  결제일
                  <input type="date" aria-label="결제일 수정" value={eDate} max={todayISO()} onChange={(e) => e.target.value && setEDate(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-primary" />
                </label>
                <label className="flex flex-col gap-0.5 text-text-muted">
                  금액
                  <NumberInput aria-label="결제 금액 수정" value={eAmount} onChange={setEAmount} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-xs font-bold tabular-nums text-text outline-none focus:border-primary" />
                </label>
                <label className="flex flex-col gap-0.5 text-text-muted">
                  방법
                  <select aria-label="결제 방법 수정" value={eMethod} onChange={(e) => setEMethod(e.target.value as "deposit" | "card")} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-primary">
                    <option value="deposit">송금</option>
                    <option value="card">법인카드</option>
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 text-text-muted">
                  {eMethod === "deposit" ? "계좌" : "카드"}
                  <select
                    aria-label={eMethod === "deposit" ? "송금 계좌 수정" : "법인카드 수정"}
                    value={(eMethod === "deposit" ? banks : cards).some((a) => a.code === eAccount) ? eAccount : ((eMethod === "deposit" ? banks : cards)[0]?.code ?? "")}
                    onChange={(e) => setEAccount(e.target.value)}
                    className="min-w-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-primary"
                  >
                    {(eMethod === "deposit" ? banks : cards).map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.nickname}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setEditId(null)} className="rounded-lg border border-border px-3 py-1 hover:bg-bg">
                  취소
                </button>
                <button type="button" onClick={() => void handleSaveEdit(x)} disabled={busy} className="rounded-lg bg-primary px-3 py-1 font-bold text-white hover:bg-primary-hover disabled:opacity-50">
                  저장
                </button>
              </div>
            </li>
          ) : (
          <li key={x.id} className="grid grid-cols-[3.5rem_1fr_auto_1.25rem_1.25rem] items-center gap-2 border-b border-border py-1.5 text-xs">
            <span className="tabular-nums text-text-muted">{shortDate(x.payment_date)}</span>
            <span className="min-w-0 truncate">{label(x)}</span>
            <span className="font-bold tabular-nums">{won(x.amount)}</span>
            {canManage ? (
              <button type="button" onClick={() => startEdit(x)} disabled={busy} aria-label={`${label(x)} ${won(x.amount)} 수정`} title="수정" className="text-text-muted hover:text-primary disabled:opacity-50">
                <Pencil size={13} />
              </button>
            ) : (
              <span />
            )}
            {canManage && (rest > 0 || i === payments.length - 1) ? (
              <button type="button" onClick={() => void handleRemove(x)} disabled={busy} aria-label={`${label(x)} ${won(x.amount)} 삭제`} title="삭제" className="text-text-muted hover:text-danger disabled:opacity-50">
                <X size={14} />
              </button>
            ) : (
              <span />
            )}
          </li>
          ),
        )}
      </ul>

      {canAdd && (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs" role="group" aria-label="결제 방법">
            {(["deposit", "card"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={method === m} onChange={() => setMethod(m)} className="h-3.5 w-3.5 accent-primary" />
                {METHOD_LABELS[m]}
              </label>
            ))}
          </div>
          <label className="col-span-2 flex items-center gap-2 text-xs text-text-muted">
            {method === "deposit" ? "계좌" : "카드"}
            <select aria-label={method === "deposit" ? "송금 계좌" : "법인카드 종류"} value={selectedAccount} onChange={(e) => setAccount(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-primary">
              {options.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.nickname}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex items-center gap-2 text-xs text-text-muted">
            결제일
            <input type="date" aria-label="결제일" value={payDate} max={todayISO()} onChange={(e) => e.target.value && setPayDate(e.target.value)} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-primary" />
          </label>
          <NumberInput
            aria-label="결제 금액"
            value={amount}
            onChange={setAmount}
            className="col-span-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-right text-xs font-bold tabular-nums outline-none focus:border-primary"
          />
          <button type="button" onClick={() => void handleAdd()} disabled={busy} className="col-span-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50">
            결제 추가
          </button>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-border pt-2 text-xs text-text-muted">
        <span>
          결제 {won(paid)} <span className="text-[11px]">/ {won(total)} ({proposal.no_vat ? "부가세 없음" : "부가세 포함"})</span>
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
      <p className="text-[11px] text-text-muted">{canManage ? "추가·수정·삭제하면 입출금관리에 바로 반영됩니다." : "작성자와 관리자만 결제를 바꿀 수 있습니다."}</p>
    </section>
    </>
  );
}

const CURRENCY_NAMES: Record<string, string> = { USD: "달러", JPY: "엔" };

/**
 * 외화 구매의 실결제 입력: 품의서의 외화 금액은 참고용으로 남기고, 결제된 원화 금액(제반 비용 포함)과 환율을 직접 적는다.
 * 해외결제는 부가세가 없으므로 [부가세 없음]을 기본으로 켜 두며 끌 수도 있다. 저장하면 이 원화 금액으로 매입매출·입출금이 만들어진다.
 */
function ForeignSettleBox({ proposal, canManage, onChanged }: { proposal: Proposal; canManage: boolean; onChanged: (updated: Proposal) => void }) {
  const currency = proposal.currency ?? "USD";
  const settled = !!proposal.settle_amount;
  const [editing, setEditing] = useState(!settled);
  const [amount, setAmount] = useState(proposal.settle_amount ? String(proposal.settle_amount) : "");
  const [rate, setRate] = useState(proposal.settle_rate ? String(proposal.settle_rate) : "");
  const [noVat, setNoVat] = useState(settled ? !!proposal.no_vat : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reference = `${currency} ${(proposal.amount ?? 0).toLocaleString()}`;

  async function handleSave() {
    const won_ = Number(digitsOnly(amount));
    const rateNum = Number(rate.replace(/,/g, ""));
    if (!won_ || won_ <= 0) {
      setError("실결제 원화 금액을 입력해 주세요.");
      return;
    }
    if (!rateNum || rateNum <= 0) {
      setError("환율을 입력해 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    logDebug("PaymentBox", `실결제 입력 시도: proposal_id=${proposal.id}, ${reference} -> ${won(won_)}, rate=${rateNum}, no_vat=${noVat}`);
    try {
      onChanged(await apiPut<Proposal>(`/api/proposals/${proposal.id}/settlement`, { settle_amount: won_, settle_rate: rateNum, no_vat: noVat }));
      setEditing(false);
    } catch (err) {
      logError("PaymentBox", "실결제 입력 실패", err);
      setError(err instanceof ApiError ? err.message : "실결제 금액을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="외화 실결제" className="flex w-full flex-col gap-2 rounded-xl border border-[#b4b3b9] bg-surface px-3.5 py-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-text-muted">해외결제 ({CURRENCY_NAMES[currency] ?? currency})</span>
        <span className="text-text-muted">구매 금액(참고) <b className="tabular-nums text-text">{reference}</b></span>
      </div>
      {editing && canManage ? (
        <div className="grid grid-cols-2 gap-1.5">
          <label className="col-span-2 flex flex-col gap-0.5 text-text-muted">
            실결제 금액 (원, 제반 비용 포함)
            <NumberInput aria-label="실결제 원화 금액" value={amount} onChange={setAmount} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-right text-xs font-bold tabular-nums text-text outline-none focus:border-primary" />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5 text-text-muted">
            환율 (1 {currency} = 원)
            <input aria-label="환율" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.,]/g, ""))} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-right text-xs font-bold tabular-nums text-text outline-none focus:border-primary" />
          </label>
          <label className="col-span-2 flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={noVat} onChange={(e) => setNoVat(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            부가세 없음 (해외결제)
          </label>
          <div className="col-span-2 flex justify-end gap-1.5">
            {settled && (
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-border px-3 py-1 hover:bg-bg">
                취소
              </button>
            )}
            <button type="button" onClick={() => void handleSave()} disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 font-bold text-white hover:bg-primary-hover disabled:opacity-50">
              실결제 금액 저장
            </button>
          </div>
        </div>
      ) : settled ? (
        <div className="flex items-center justify-between gap-2">
          <span>
            실결제 <b className="tabular-nums">{won(proposal.settle_amount ?? 0)}</b>
            {proposal.settle_rate ? <span className="text-text-muted"> · 환율 {proposal.settle_rate.toLocaleString()}</span> : null}
            <span className="text-text-muted"> · {proposal.no_vat ? "부가세 없음" : "부가세 포함"}</span>
          </span>
          {canManage && (
            <button type="button" onClick={() => setEditing(true)} className="text-primary hover:underline">
              수정
            </button>
          )}
        </div>
      ) : (
        <p className="text-text-muted">실결제 금액이 입력되면 입출금·매입매출에 반영됩니다. (작성자와 관리자만 입력할 수 있습니다.)</p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
