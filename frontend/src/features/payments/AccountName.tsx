import { useState } from "react";
import { nameOf, usePaymentAccounts, type AccountKind } from "./paymentAccounts";

/**
 * 카드·계좌 이름. 평소에는 지정한 별명만 보이고, 누르면 카드사(은행)와 뒤 4자리를 확인할 수 있다 (다시 누르면 접힌다).
 * 표의 줄을 누르면 상세가 열리는 곳에서도 쓸 수 있게 누름이 위로 퍼지지 않게 한다.
 */
export function AccountName({ kind, code, className = "" }: { kind: AccountKind; code: string | null | undefined; className?: string }) {
  const { all } = usePaymentAccounts();
  const [open, setOpen] = useState(false);
  if (!code) return null;
  const account = all.find((a) => a.kind === kind && a.code === code);
  const name = nameOf(all, kind, code);
  if (!account) return <span className={className}>{name}</span>;
  const detail = `${account.issuer}${account.last4 ? ` ····${account.last4}` : ""}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      title={open ? "누르면 접습니다" : "누르면 카드사·뒤 4자리를 확인합니다"}
      aria-expanded={open}
      className={`inline cursor-pointer underline-offset-2 hover:underline ${className}`}
    >
      {name}
      {open && <span className="ml-1 text-text-muted tabular-nums">({detail})</span>}
    </button>
  );
}
