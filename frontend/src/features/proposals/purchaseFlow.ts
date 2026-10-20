import { formatDocAmount, itemsSummary, itemsTotal } from "../projectDocuments/documentHelpers";
import type { ProjectDocument } from "../projectDocuments/types";
import type { Proposal } from "./types";

/** 구매 품의서: 승인 후 발주서 작성 → 발송 확인 → 입고 확인까지 한 장의 카드로 이어서 관리하는 품의서 종류 이름 (서버와 같은 값) */
export const PURCHASE_KIND = "구매";

export const isPurchaseProposal = (p: Proposal) => p.kind === PURCHASE_KIND;

export type FlowTone = "blue" | "green" | "red" | "gray" | "orange" | "purple";

export interface FlowChip {
  label: string;
  tone: FlowTone;
  title?: string;
}

export interface PurchaseFlow {
  /** ① 결재 상태 배지. 결재가 2단계이면 결재대기가 2개 나온다 */
  approval: FlowChip[];
  /** ② 발주 버튼을 누를 수 있는지 (품의 결재가 승인된 뒤) */
  canOrder: boolean;
  /** ③ 발주 상태 */
  orderLabel: FlowChip;
  /** 승인된 발주서가 있어 거래처에 보낼 수 있는 상태인지 */
  orderApproved: boolean;
  /** 발주 단계가 끝났는지: 승인된 발주서가 있거나, 온라인 주문처럼 발주서 없이 "발주 완료"로 처리한 경우 */
  orderDone: boolean;
  /** 발주서 없이 "발주 완료"로 처리한 온라인 주문 */
  onlineOrdered: boolean;
  /** 이 품의서에서 만든 발주서 중 반려되지 않은 것 */
  activeOrders: ProjectDocument[];
  /** 발송 확인 버튼을 보여 줄지 (승인된 발주서가 있고 아직 발송 확인 전) */
  canConfirmSent: boolean;
  sent: boolean;
  /** ④ 입고 버튼을 누를 수 있는지 (발송 확인 후) */
  canReceive: boolean;
  received: boolean;
  receiveLabel: FlowChip;
  /** 입고 후 등록해야 하는 서류의 등록 여부: 거래명세서·세금계산서 파일이 각각 1장 이상 올라와 있는가 */
  statementRegistered: boolean;
  taxInvoiceRegistered: boolean;
  /** 입고가 끝났는데 두 서류 중 빠진 것이 있다 (카드에 주황 띠로 알린다) */
  docsMissing: boolean;
}

/** 품의서와 그 품의서에서 만든 발주서들로 카드의 진행 상태를 계산한다. */
export function computePurchaseFlow(proposal: Proposal, orders: ProjectDocument[]): PurchaseFlow {
  const linked = orders.filter((d) => d.proposal_id === proposal.id && d.doc_type === "purchase_order");
  const activeOrders = linked.filter((d) => d.status !== "rejected");
  const approved = proposal.status === "approved" && !proposal.delete_requested;

  const approval: FlowChip[] = [];
  if (proposal.status === "rejected") {
    approval.push({ label: "반려됨", tone: "red", title: proposal.reject_reason ?? undefined });
  } else if (proposal.status === "approved") {
    approval.push({ label: "승인됨", tone: "green" });
    if (proposal.is_final_decision) approval.push({ label: "전결", tone: "purple" });
  } else if (proposal.steps.length === 0) {
    approval.push({ label: "결재대기", tone: "blue" });
  } else {
    for (const step of proposal.steps) {
      const who = `${step.approver_name}`;
      approval.push(
        step.status === "approved"
          ? { label: "승인", tone: "green", title: `${who} 승인` }
          : { label: "결재대기", tone: "blue", title: `${who} 결재 대기` },
      );
    }
  }
  if (proposal.delete_requested) approval.push({ label: "삭제 결재 중", tone: "red" });

  const orderApproved = activeOrders.some((d) => d.status === "approved");
  const sent = proposal.order_sent_at !== null;
  // 발주서 없이 발주 완료로 처리하면 발송 확인 시각만 채워진다 (온라인 주문: 결제까지 온라인에서 끝나 보낼 문서가 없다)
  const onlineOrdered = approved && sent && activeOrders.length === 0;
  const orderDone = orderApproved || onlineOrdered;
  let orderLabel: FlowChip;
  if (!approved) orderLabel = { label: "발주 대기", tone: "gray" };
  else if (onlineOrdered) orderLabel = { label: "발주 완료", tone: "green", title: "온라인 주문 (발주서 없음)" };
  else if (activeOrders.length === 0) orderLabel = { label: "미발주", tone: "red" };
  else if (orderApproved) orderLabel = { label: "발주 완료", tone: "green" };
  else orderLabel = { label: "발주서 확인중", tone: "blue" };

  const received = proposal.received_at !== null;
  const receiveLabel: FlowChip = received
    ? { label: "입고 완료", tone: "green" }
    : sent
      ? { label: "입고 대기", tone: "orange" }
      : { label: "발송 대기", tone: "gray" };

  const hasDoc = (kind: "statement" | "tax_invoice") => proposal.attachments.some((a) => a.kind === "file" && a.doc_kind === kind);
  const statementRegistered = hasDoc("statement");
  const taxInvoiceRegistered = hasDoc("tax_invoice");

  return {
    approval,
    canOrder: approved,
    orderLabel,
    orderApproved,
    orderDone,
    onlineOrdered,
    activeOrders,
    canConfirmSent: approved && orderApproved && !sent,
    sent,
    canReceive: approved && sent,
    received,
    receiveLabel,
    statementRegistered,
    taxInvoiceRegistered,
    docsMissing: approved && received && !(statementRegistered && taxInvoiceRegistered),
  };
}

/** 카드 오른쪽에 보여 줄 거래처·내용·합계 (발주서가 생기면 그 값, 아직 없으면 null). 발주서가 여러 장이면 합산한다. */
export function summarizeOrders(orders: ProjectDocument[]): { client: string; content: string; total: string | null } | null {
  if (orders.length === 0) return null;
  const clients = Array.from(new Set(orders.map((d) => d.client_name)));
  const content = orders.length === 1 ? itemsSummary(orders[0]) : `${itemsSummary(orders[0])} 외 발주서 ${orders.length - 1}건`;
  const sameCurrency = orders.every((d) => d.currency === orders[0].currency);
  const total = sameCurrency ? formatDocAmount(orders[0], orders.reduce((sum, d) => sum + itemsTotal(d), 0)) : null;
  return { client: clients.length === 1 ? clients[0] : `${clients[0]} 외 ${clients.length - 1}곳`, content, total };
}
