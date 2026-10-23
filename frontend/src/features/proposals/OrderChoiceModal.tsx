import { usePaymentAccounts } from "../payments/paymentAccounts";
import { FileText, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectDocument } from "../projectDocuments/types";
import { PROJECT_DOC_STATUS_LABELS } from "../projectDocuments/types";
import { NO_PAYMENT, PaymentPicker, paymentLabel, type OrderPayment } from "./PaymentPicker";
import { PaymentBox } from "./PaymentBox";
import type { Proposal } from "./types";

interface OrderChoiceModalProps {
  proposal: Proposal;
  /** 이 품의서에서 만든 발주서(반려 제외) */
  orders: ProjectDocument[];
  /** 이미 "발주 완료"(온라인 주문)로 처리됨 */
  onlineOrdered: boolean;
  /** 발주 단계가 끝남 (승인된 발주서가 있거나 온라인 주문으로 발주 완료 처리). 끝나면 발주서를 새로 작성할 수 없고 보기만 한다. */
  orderDone: boolean;
  canManage: boolean;
  busy: boolean;
  onCreateOrder: () => void;
  /** 발주 완료 처리 (온라인 주문 등). 고른 결제 방법을 함께 보낸다. */
  onOnlineDone: (payment: OrderPayment) => void;
  /** 발주 취소 (발송 확인·발주 완료를 되돌린다) */
  onCancelOrder: () => void;
  /** 결제 내역을 추가·삭제해서 품의서가 바뀌었다 */
  onProposalChanged: (updated: Proposal) => void;
  onOpenOrder: (doc: ProjectDocument) => void;
  onClose: () => void;
}

/** 발주 버튼을 눌렀을 때: 발주서를 작성할지, 발주서 없이 "발주 완료"로 처리할지(온라인 주문 등) 고른다. */
export function OrderChoiceModal({ proposal, orders, onlineOrdered, orderDone, canManage, busy, onCreateOrder, onOnlineDone, onProposalChanged, onCancelOrder, onOpenOrder, onClose }: OrderChoiceModalProps) {
  usePaymentAccounts(); // 카드·계좌 이름이 로드되면 버튼 글자를 다시 그린다
  const [choosing, setChoosing] = useState(false);
  const [payment, setPayment] = useState<OrderPayment>(NO_PAYMENT);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasOrders = orders.length > 0;
  const createDisabled = busy || orderDone;
  const onlineDisabled = busy || !canManage || hasOrders || onlineOrdered;
  const onlineHint = hasOrders
    ? "이미 발주서가 작성되어 있습니다."
    : onlineOrdered
      ? "이미 발주 완료로 처리되었습니다."
      : !canManage
        ? "작성자 또는 관리자만 처리할 수 있습니다."
        : "온라인 주문처럼 발주서 없이 주문·결제를 마친 경우에 선택합니다.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="발주 방법 선택"
        className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">발주 방법 선택</h2>
            <p className="text-xs text-text-muted mt-0.5 truncate" title={proposal.title}>
              {proposal.title}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded text-text-muted hover:bg-bg hover:text-text">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onCreateOrder}
            disabled={createDisabled}
            className="flex items-start gap-3 rounded-xl border border-border px-4 py-3 text-left hover:border-primary/50 hover:bg-tile-blue disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-border"
          >
            <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-full bg-primary text-white shrink-0">
              <FileText size={17} />
            </span>
            <span>
              <span className="block text-sm font-semibold">발주서 작성</span>
              <span className="block text-xs text-text-muted mt-0.5">
                {orderDone ? "이미 발주 완료되어 발주서를 새로 작성할 수 없습니다. 아래에서 발주서를 확인하세요." : "발주서를 작성해 거래처에 보냅니다. 작성 후 카드에서 발송 확인을 눌러 주세요."}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setChoosing((v) => !v)}
            disabled={onlineDisabled}
            className="flex items-start gap-3 rounded-xl border border-border px-4 py-3 text-left hover:border-tile-green-fg/50 hover:bg-tile-green disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-border"
          >
            <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-full bg-tile-green-fg text-white shrink-0">
              <ShoppingBag size={17} />
            </span>
            <span>
              <span className="block text-sm font-semibold">발주 완료</span>
              <span className="block text-xs text-text-muted mt-0.5">{onlineHint}</span>
            </span>
          </button>
          {choosing && !onlineDisabled && (
            <div className="-mt-1 rounded-xl border border-border bg-bg px-4 py-3 flex flex-col gap-3">
              <p className="text-xs text-text-muted">결제 방법을 확인해 주세요. 아무것도 선택하지 않으면 외상으로 처리됩니다. (매입매출관리·입출금관리에 자동 반영)</p>
              <PaymentPicker value={payment} onChange={setPayment} />
              <button
                type="button"
                onClick={() => onOnlineDone(payment)}
                disabled={busy}
                className="self-end rounded-lg bg-tile-green-fg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                이 내용으로 처리 ({paymentLabel(payment)})
              </button>
            </div>
          )}
        </div>

        {orderDone && proposal.order_sent_at && (
          <div className="mt-4">
            <PaymentBox proposal={proposal} canManage={canManage} onChanged={onProposalChanged} />
          </div>
        )}

        {proposal.order_sent_at && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-danger/30 px-4 py-3">
            <p className="text-xs text-text-muted">
              {proposal.received_at ? "입고 완료된 건은 입고를 먼저 취소해야 발주를 취소할 수 있습니다." : "주문을 취소했다면 발주 완료를 되돌려 발주 전 상태로 돌립니다."}
            </p>
            <button
              type="button"
              onClick={onCancelOrder}
              disabled={busy || !canManage || !!proposal.received_at}
              className="shrink-0 rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger hover:bg-[#fef2f2] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              발주 취소
            </button>
          </div>
        )}

        {(hasOrders || orderDone) && (
          <div className="mt-4">
            <p className="text-xs text-text-muted mb-1.5">발주서 보기</p>
            {hasOrders ? (
              <ul className="flex flex-col gap-1">
                {orders.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => onOpenOrder(d)}
                      className="w-full flex items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2 text-sm hover:bg-tile-blue"
                    >
                      <span className="truncate">
                        {d.issue_date} · {d.client_name}
                      </span>
                      <span className="text-xs text-text-muted shrink-0">{PROJECT_DOC_STATUS_LABELS[d.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-bg px-3 py-2 text-sm text-text-muted">발주서 없음 (온라인 주문으로 발주 완료 처리됨)</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
