import { usePaymentAccounts } from "../payments/paymentAccounts";
import { PackageCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PaymentPicker, paymentFromProposal, paymentLabel, type OrderPayment } from "./PaymentPicker";
import type { Proposal } from "./types";

interface ReceiveModalProps {
  proposal: Proposal;
  busy: boolean;
  /** 입고 완료 처리: 대금 결제 여부(외상 / 입금 / 법인카드)를 함께 보낸다 */
  onConfirm: (payment: OrderPayment) => void;
  onClose: () => void;
}

/** 입고 완료를 누르면 대금을 이미 결제했는지(입금·법인카드) 아직인지(외상) 한 번 확인한다. 결과는 매입매출관리·입출금관리에 반영된다. */
export function ReceiveModal({ proposal, busy, onConfirm, onClose }: ReceiveModalProps) {
  usePaymentAccounts(); // 카드·계좌 이름이 로드되면 버튼 글자를 다시 그린다
  const [payment, setPayment] = useState<OrderPayment>(() => paymentFromProposal(proposal));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="입고 완료 · 대금 결제 확인"
        className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">입고 완료 · 대금 결제 확인</h2>
            <p className="text-xs text-text-muted mt-0.5 truncate" title={proposal.title}>
              {proposal.title}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded text-text-muted hover:bg-bg hover:text-text">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-xl border border-border bg-bg px-4 py-3 flex flex-col gap-3">
          <p className="text-sm font-medium">대금을 결제하셨나요?</p>
          <p className="text-xs text-text-muted">
            이미 결제했다면 입금(계좌) 또는 법인카드를 선택해 주세요. 아무것도 선택하지 않으면 <b>외상</b>으로 처리됩니다. 결과는 매입매출관리와 입출금관리에 반영됩니다.
          </p>
          <PaymentPicker value={payment} onChange={setPayment} />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg">
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(payment)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            <PackageCheck size={15} />
            입고 완료 ({paymentLabel(payment)})
          </button>
        </div>
      </div>
    </div>
  );
}
