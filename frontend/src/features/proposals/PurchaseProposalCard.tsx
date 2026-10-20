import { ArrowRight, Check, Download, FileText, Package, Paperclip, Printer, ShoppingCart } from "lucide-react";
import { ClampText } from "../../components/ui/ClampText";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import type { ProjectDocument } from "../projectDocuments/types";
import { computePurchaseFlow, summarizeOrders, type FlowChip, type FlowTone } from "./purchaseFlow";
import type { Proposal } from "./types";

const TONE_CLASS: Record<FlowTone, string> = {
  blue: SOFT_BADGE.blue,
  green: SOFT_BADGE.green,
  red: SOFT_BADGE.red,
  gray: SOFT_BADGE.gray,
  orange: SOFT_BADGE.orange,
  purple: SOFT_BADGE.purple,
};

const monthDay = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : "");

function Badge({ chip }: { chip: FlowChip }) {
  return (
    <span title={chip.title} className={`text-xs px-2 py-1 font-medium whitespace-nowrap ${TONE_CLASS[chip.tone]}`}>
      {chip.label}
    </span>
  );
}

/** 흐름 버튼(동그란 아이콘 + 아래 상태). 켜진 버튼은 파랑, 끝난 단계는 초록, 아직 못 누르는 단계는 회색 */
function FlowButton({
  icon,
  label,
  state,
  disabled,
  title,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  state: "ready" | "done" | "locked";
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const style =
    state === "done"
      ? "bg-tile-green-fg text-white"
      : state === "ready"
        ? "bg-primary text-white hover:bg-primary-hover"
        : "bg-tile-blue text-tile-blue-fg/60";
  return (
    <div className="flex flex-col items-center gap-1.5 w-[84px]">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={label}
        className={`relative w-12 h-12 rounded-full grid place-items-center transition-colors disabled:cursor-not-allowed ${style}`}
      >
        {icon}
        {state === "done" && (
          <span className="absolute -right-0.5 -bottom-0.5 w-4 h-4 rounded-full bg-surface text-tile-green-fg grid place-items-center border border-tile-green-fg">
            <Check size={10} strokeWidth={3} />
          </span>
        )}
      </button>
      <span className="text-xs font-medium text-text">{label}</span>
      {children}
    </div>
  );
}

interface PurchaseProposalCardProps {
  proposal: Proposal;
  /** 전체 발주서 목록 (이 품의서에서 만든 것만 골라 쓴다) */
  orders: ProjectDocument[];
  /** 작성자 또는 관리자: 발송·입고 확인을 할 수 있다 */
  canManage: boolean;
  busy: boolean;
  onOpen: () => void;
  onOrder: () => void;
  onOpenOrder: (doc: ProjectDocument) => void;
  onToggleSent: (sent: boolean) => void;
  onToggleReceived: (received: boolean) => void;
  onAttach: () => void;
  onDownload: () => void;
  onPrint: () => void;
}

// 구매 품의서 카드: 품의 결재 → 발주(발주서 작성·발송 확인) → 입고 → 첨부(거래명세서·세금계산서 등)를 한 장에서 이어서 본다.
export function PurchaseProposalCard({
  proposal,
  orders,
  canManage,
  busy,
  onOpen,
  onOrder,
  onOpenOrder,
  onToggleSent,
  onToggleReceived,
  onAttach,
  onDownload,
  onPrint,
}: PurchaseProposalCardProps) {
  const flow = computePurchaseFlow(proposal, orders);
  const summary = summarizeOrders(flow.activeOrders);
  const orderTitle = !flow.canOrder
    ? "품의 결재가 승인되면 발주서를 작성할 수 있습니다."
    : flow.activeOrders.length === 0
      ? "발주서 작성"
      : "작성한 발주서 보기";

  function handleOrder() {
    if (flow.activeOrders.length === 0) onOrder();
    else onOpenOrder(flow.activeOrders[flow.activeOrders.length - 1]);
  }

  return (
    <div
      onClick={onOpen}
      className="bg-surface border border-border rounded-2xl px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-4 cursor-pointer hover:border-primary/40 transition-colors"
    >
      {/* 제목 · 배지 · 날짜 */}
      <div className="flex items-center gap-4 min-w-[290px] flex-1 basis-[290px]">
        <div className="w-14 h-14 rounded-full bg-tile-orange-fg text-white grid place-items-center shrink-0">
          <ShoppingCart size={24} />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-text truncate" title={proposal.title}>
            {proposal.title}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.orange}`}>구매품의서</span>
            {flow.approval.map((chip, i) => (
              <Badge key={i} chip={chip} />
            ))}
          </div>
          <p className="text-xs text-text mt-1.5">{proposal.issue_date}</p>
          <p className="text-[11px] text-text-muted">No. {proposal.doc_no}</p>
        </div>
      </div>

      {/* 발주 → 입고, 첨부 */}
      <div className="flex items-start gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <FlowButton
          icon={<FileText size={20} />}
          label="발주"
          state={flow.orderApproved ? "done" : flow.canOrder ? "ready" : "locked"}
          disabled={!flow.canOrder || busy}
          title={orderTitle}
          onClick={handleOrder}
        >
          <Badge chip={flow.orderLabel} />
          {flow.canConfirmSent && (
            <button
              type="button"
              disabled={!canManage || busy}
              onClick={() => onToggleSent(true)}
              title={canManage ? "발주서를 거래처에 보낸 뒤 눌러 주세요." : "작성자 또는 관리자만 확인할 수 있습니다."}
              className="text-[11px] px-2 py-0.5 rounded-md border border-primary text-primary hover:bg-tile-blue disabled:opacity-40 disabled:cursor-not-allowed"
            >
              발송 확인
            </button>
          )}
          {flow.sent && (
            <button
              type="button"
              disabled={!canManage || busy || flow.received}
              onClick={() => onToggleSent(false)}
              title={flow.received ? "입고 확인을 먼저 취소해야 합니다." : canManage ? "눌러서 발송 확인을 취소" : undefined}
              className="text-[11px] text-tile-green-fg disabled:cursor-default"
            >
              발송 완료 {monthDay(proposal.order_sent_at)}
            </button>
          )}
        </FlowButton>
        <ArrowRight size={18} className="text-text-muted mt-3.5" />
        <FlowButton
          icon={<Package size={20} />}
          label="입고"
          state={flow.received ? "done" : flow.canReceive ? "ready" : "locked"}
          disabled={!flow.canReceive || !canManage || busy}
          title={
            !flow.canReceive
              ? "발주서 발송 확인 후에 입고 처리를 할 수 있습니다."
              : !canManage
                ? "작성자 또는 관리자만 처리할 수 있습니다."
                : flow.received
                  ? "눌러서 입고 확인을 취소"
                  : "물품을 받았으면 눌러서 입고 완료 처리"
          }
          onClick={() => onToggleReceived(!flow.received)}
        >
          <Badge chip={flow.receiveLabel} />
          {flow.received && <span className="text-[11px] text-text-muted">{monthDay(proposal.received_at)}</span>}
        </FlowButton>
        <div className="w-px self-stretch bg-border mx-3" />
        <FlowButton
          icon={<Paperclip size={20} />}
          label="첨부"
          state="locked"
          title="거래명세서·세금계산서 등 관련 서류 첨부"
          onClick={onAttach}
        >
          <span className="text-[11px] text-text-muted">{proposal.attachments.length > 0 ? `${proposal.attachments.length}건` : "없음"}</span>
        </FlowButton>
      </div>

      {/* 거래처 · 내용 */}
      <div className="grid gap-1.5 min-w-[200px] basis-[220px] flex-1">
        <div className="bg-bg rounded-lg px-3 py-1.5">
          <p className="text-[10px] text-text-muted">거래처명</p>
          <p className="text-sm font-medium truncate" title={summary?.client}>
            {summary?.client ?? "-"}
          </p>
        </div>
        <div className="bg-bg rounded-lg px-3 py-1.5">
          <p className="text-[10px] text-text-muted">내용</p>
          <div className="text-sm">
            <ClampText>{summary?.content ?? "-"}</ClampText>
          </div>
        </div>
      </div>

      {/* 합계 · 저장/출력 */}
      <div className="flex flex-col items-end gap-2 min-w-[150px]" onClick={(e) => e.stopPropagation()}>
        <div className="text-right">
          <p className="text-[10px] text-text-muted">합계금액</p>
          <p className="text-lg font-bold text-primary tabular-nums">{summary?.total ?? "-"}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDownload}
            disabled={!(proposal.status === "approved" && proposal.has_pdf) || busy}
            title={proposal.status === "approved" ? "품의서 저장 (PDF)" : "결재 승인 후 이용 가능합니다."}
            className="p-2 rounded-lg border border-border text-text-muted hover:text-primary hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            onClick={onPrint}
            disabled={proposal.status !== "approved"}
            title={proposal.status === "approved" ? "품의서 출력" : "결재 승인 후 이용 가능합니다."}
            className="p-2 rounded-lg border border-border text-text-muted hover:text-primary hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Printer size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
