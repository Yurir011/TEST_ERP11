import { ArrowRight, Check, Download, FileText, Mail, Package, Paperclip, Printer, Sheet, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ClampText } from "../../components/ui/ClampText";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import type { ProjectDocument } from "../projectDocuments/types";
import { computePurchaseFlow, summarizeOrders, type FlowChip, type FlowTone } from "./purchaseFlow";
import { MAX_PROPOSAL_FILES, fileCountOf } from "./ProposalAttachmentsModal";
import type { Proposal, ProposalAttachment } from "./types";

const TONE_CLASS: Record<FlowTone, string> = {
  blue: SOFT_BADGE.blue,
  green: SOFT_BADGE.green,
  red: SOFT_BADGE.red,
  gray: SOFT_BADGE.gray,
  orange: SOFT_BADGE.orange,
  purple: SOFT_BADGE.purple,
};

const ICON_BUTTON =
  "p-2 rounded-lg border border-border text-text-muted hover:text-primary hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed";

const monthDay = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : "");

interface ActionItem {
  key: string;
  label: string;
  onSelect: () => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * 오른쪽 아이콘 버튼. 대상이 하나면 누르는 즉시 실행하고, 둘 이상이면 목록을 열어 고르게 한다. 대상이 없으면 꺼 두고 이유를 마우스 안내로 보여 준다.
 * 둘 이상이면 체크박스로 여러 개를 고르고 실행 버튼(선택 저장·선택 출력 등)으로 한 번에 처리한다. 처음에는 모두 선택되어 있다.
 */
function ActionMenuButton({
  icon,
  label,
  items,
  emptyTitle,
  busy,
  runLabel,
}: {
  icon: ReactNode;
  label: string;
  items: ActionItem[];
  emptyTitle: string;
  busy: boolean;
  /** 체크한 항목을 한 번에 실행하는 버튼의 이름 (예: 선택 저장) */
  runLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const disabled = items.length === 0 || busy;
  const title = items.length === 0 ? emptyTitle : items.length === 1 ? items[0].label : `${label}: ${items.length}개 중 선택`;
  const selected = items.filter((it) => checked.has(it.key));

  function toggleOpen() {
    if (items.length === 1) {
      items[0].onSelect();
      return;
    }
    if (!open) setChecked(new Set(items.map((it) => it.key))); // 열 때마다 모두 선택된 상태로 시작
    setOpen((o) => !o);
  }

  function toggleOne(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function runSelected() {
    const targets = selected;
    setOpen(false);
    // 브라우저가 연달아 내려받기를 막지 않도록 조금씩 간격을 두고 차례로 실행한다
    for (let i = 0; i < targets.length; i++) {
      targets[i].onSelect();
      if (i < targets.length - 1) await sleep(350);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-label={label}
        aria-haspopup={items.length > 1 ? "dialog" : undefined}
        aria-expanded={items.length > 1 ? open : undefined}
        onClick={toggleOpen}
        className={ICON_BUTTON}
      >
        {icon}
        {items.length > 1 && (
          <span className="absolute -right-1 -bottom-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-primary text-white text-[9px] font-semibold grid place-items-center">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={label} className="absolute right-0 top-full mt-1 z-30 w-[320px] rounded-xl border border-border bg-surface p-2 shadow-lg">
          <label className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              aria-label="전체 선택"
              checked={selected.length === items.length}
              onChange={(e) => setChecked(e.target.checked ? new Set(items.map((it) => it.key)) : new Set())}
              className="h-4 w-4 accent-primary"
            />
            전체 선택
            <span className="ml-auto text-text-muted tabular-nums">
              {selected.length}/{items.length}
            </span>
          </label>
          <ul className="max-h-60 overflow-y-auto py-1">
            {items.map((it) => (
              <li key={it.key}>
                <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg cursor-pointer">
                  <input type="checkbox" checked={checked.has(it.key)} onChange={() => toggleOne(it.key)} className="h-4 w-4 shrink-0 accent-primary" />
                  <span className="truncate" title={it.label}>
                    {it.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void runSelected()}
            disabled={selected.length === 0}
            className="mt-1 w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {runLabel} ({selected.length})
          </button>
        </div>
      )}

    </div>
  );
}

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
  state: "ready" | "done" | "locked" | "plain";
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const style =
    state === "plain"
      ? "bg-transparent text-primary hover:bg-tile-blue" // 배경 없이 아이콘만 (첨부)
      : state === "done"
      ? "bg-tile-green-fg text-white"
      : state === "ready"
        ? "bg-primary text-white hover:bg-primary-hover"
        : "bg-tile-blue text-tile-blue-fg/60";
  return (
    <div className="flex flex-col items-center gap-1 w-[76px]">
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
      {/* 아래 상태 줄은 세 칸이 같은 높이·같은 위치에서 시작하도록 감싼다 (배지가 있는 칸과 없는 칸의 세로 위치가 어긋나지 않게) */}
      <div className="flex flex-col items-center gap-1 min-h-7">{children}</div>
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
  /** 발주 버튼: 발주서 작성 / 발주 완료(온라인 주문 등)를 고르는 팝업을 연다 */
  onOrder: () => void;
  onToggleSent: (sent: boolean) => void;
  onToggleReceived: (received: boolean) => void;
  onAttach: () => void;
  /** 품의서 PDF 저장 / 엑셀 저장 / 출력 */
  onDownloadProposal: () => void;
  onDownloadProposalExcel: () => void;
  onPrintProposal: () => void;
  /** 연결된 발주서(결재가 끝난 것)의 PDF 저장 / 출력 / 엑셀 저장 / 메일 발송 */
  onDownloadOrder: (doc: ProjectDocument) => void;
  onPrintOrder: (doc: ProjectDocument) => void;
  onDownloadOrderExcel: (doc: ProjectDocument) => void;
  onSendOrder: (doc: ProjectDocument) => void;
  /** 올려 둔 첨부파일 저장 */
  onDownloadAttachment: (attachment: ProposalAttachment) => void;
  /** 품의서 삭제 (승인된 품의서는 삭제 결재를 요청한다) */
  onDelete: () => void;
  canDelete: boolean;
}

// 구매 품의서 카드: 품의 결재 → 발주(발주서 작성·발송 확인) → 입고 → 첨부(거래명세서·세금계산서 등)를 한 장에서 이어서 본다.
export function PurchaseProposalCard({
  proposal,
  orders,
  canManage,
  busy,
  onOpen,
  onOrder,
  onToggleSent,
  onToggleReceived,
  onAttach,
  onDownloadProposal,
  onDownloadProposalExcel,
  onPrintProposal,
  onDownloadOrder,
  onPrintOrder,
  onDownloadOrderExcel,
  onSendOrder,
  onDownloadAttachment,
  onDelete,
  canDelete,
}: PurchaseProposalCardProps) {
  const flow = computePurchaseFlow(proposal, orders);
  const summary = summarizeOrders(flow.activeOrders);
  // 저장·출력·엑셀·메일의 대상: 결재가 끝나 파일이 만들어진 문서만
  const proposalReady = proposal.status === "approved" && proposal.has_pdf;
  const readyOrders = flow.activeOrders.filter((d) => d.status === "approved" && d.has_pdf);
  const orderName = (d: ProjectDocument) => `발주서 · ${d.issue_date} ${d.client_name}`;
  const saveItems: ActionItem[] = [
    ...(proposalReady ? [{ key: "proposal", label: "품의서 (PDF)", onSelect: onDownloadProposal }] : []),
    ...readyOrders.map((d) => ({ key: `order-${d.id}`, label: `${orderName(d)} (PDF)`, onSelect: () => onDownloadOrder(d) })),
    ...proposal.attachments.filter((a) => a.kind === "file").map((a) => ({ key: `att-${a.id}`, label: `첨부 · ${a.label}`, onSelect: () => onDownloadAttachment(a) })),
  ];
  const excelItems: ActionItem[] = [
    ...(proposal.status === "approved" ? [{ key: "proposal", label: "품의서 (엑셀)", onSelect: onDownloadProposalExcel }] : []),
    ...readyOrders.map((d) => ({ key: `order-${d.id}`, label: `${orderName(d)} (엑셀)`, onSelect: () => onDownloadOrderExcel(d) })),
  ];
  const printItems: ActionItem[] = [
    ...(proposalReady ? [{ key: "proposal", label: "품의서", onSelect: onPrintProposal }] : []),
    ...readyOrders.map((d) => ({ key: `order-${d.id}`, label: orderName(d), onSelect: () => onPrintOrder(d) })),
  ];
  const mailItems: ActionItem[] = readyOrders.map((d) => ({ key: `order-${d.id}`, label: `${orderName(d)} 메일 발송`, onSelect: () => onSendOrder(d) }));
  const orderTitle = flow.canOrder ? "발주서 작성 또는 발주 완료 선택" : "품의 결재가 승인되면 발주할 수 있습니다.";

  return (
    <div
      onClick={onOpen}
      className="bg-surface border border-border rounded-2xl px-4 py-3 flex flex-wrap items-start gap-x-4 gap-y-3 cursor-pointer hover:border-primary/40 transition-colors"
    >
      {/* 제목 · 배지 · 날짜 */}
      <div className="flex items-start gap-3 w-[250px] shrink-0">
        <div className="w-12 h-12 rounded-full bg-tile-orange-fg text-white grid place-items-center shrink-0">
          <ShoppingCart size={21} />
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
          state={flow.orderDone ? "done" : flow.canOrder ? "ready" : "locked"}
          disabled={!flow.canOrder || busy}
          title={orderTitle}
          onClick={onOrder}
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
              title={flow.received ? "입고 확인을 먼저 취소해야 합니다." : canManage ? "눌러서 취소" : undefined}
              className="text-[11px] text-tile-green-fg disabled:cursor-default"
            >
              {flow.onlineOrdered ? "온라인 주문" : "발송 완료"} {monthDay(proposal.order_sent_at)}
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
        <FlowButton
          icon={<Paperclip size={20} />}
          label="첨부"
          state="plain"
          title="거래명세서·세금계산서 등 관련 서류 올리기"
          onClick={onAttach}
        >
          <Badge chip={{ label: `${fileCountOf(proposal)}/${MAX_PROPOSAL_FILES}`, tone: "gray" }} />
        </FlowButton>
        <div className="w-px self-stretch bg-border mx-1.5" />
      </div>

      {/* 거래처 · 내용 */}
      <div className="grid gap-1 min-w-[170px] basis-[190px] flex-1 grow-[3]">
        <div className="bg-bg rounded-lg px-2.5 py-1">
          <p className="text-[10px] text-text-muted">거래처명</p>
          <p className="text-sm font-medium truncate" title={summary?.client}>
            {summary?.client ?? "-"}
          </p>
        </div>
        <div className="bg-bg rounded-lg px-2.5 py-1">
          <p className="text-[10px] text-text-muted">내용</p>
          <div className="text-sm">
            <ClampText>{summary?.content ?? "-"}</ClampText>
          </div>
        </div>
      </div>

      {/* 합계 · 저장/출력 */}
      <div className="flex flex-col items-end gap-1.5 min-w-[120px]" onClick={(e) => e.stopPropagation()}>
        <div className="text-right">
          <p className="text-[10px] text-text-muted">합계금액</p>
          <p className="text-lg font-bold text-primary tabular-nums">{summary?.total ?? "-"}</p>
        </div>
        <div className="flex items-center gap-1">
          <ActionMenuButton icon={<Download size={15} />} label="저장" items={saveItems} emptyTitle="결재 승인 후 저장할 문서가 생깁니다." busy={busy} runLabel="선택 저장" />
          <ActionMenuButton icon={<Sheet size={15} />} label="엑셀 저장" items={excelItems} emptyTitle="결재 승인 후 엑셀로 저장할 수 있습니다." busy={busy} runLabel="선택 엑셀 저장" />
          <ActionMenuButton icon={<Printer size={15} />} label="출력" items={printItems} emptyTitle="결재 승인 후 출력할 문서가 생깁니다." busy={busy} runLabel="선택 출력" />
          <ActionMenuButton icon={<Mail size={15} />} label="메일 발송" items={mailItems} emptyTitle="발주서가 작성되면 메일로 보낼 수 있습니다." busy={busy} runLabel="선택 메일 발송" />
          <button
            type="button"
            onClick={onDelete}
            disabled={!canDelete || busy}
            title={
              proposal.delete_requested
                ? "삭제 결재가 진행 중입니다."
                : !canDelete
                  ? "작성자 또는 관리자(승인된 품의서)만 삭제할 수 있습니다."
                  : proposal.status === "approved"
                    ? "삭제 결재 요청"
                    : "삭제"
            }
            aria-label="품의서 삭제"
            className={`${ICON_BUTTON} hover:!text-danger hover:!border-danger/40`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
