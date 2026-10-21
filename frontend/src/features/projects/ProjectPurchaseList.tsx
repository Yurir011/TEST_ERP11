import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { ProjectDocument } from "../projectDocuments/types";
import { computePurchaseFlow, isPurchaseProposal, summarizeOrders, summarizeProposal, type PurchaseFlow } from "../proposals/purchaseFlow";
import type { Proposal } from "../proposals/types";

type StepState = "done" | "now" | "idle" | "fail";

/** 이 구매 건의 품의 → 발주 → 입고 진행 상태 (전자결재의 구매 카드와 같은 기준) */
export function purchaseSteps(proposal: Proposal, flow: PurchaseFlow): { label: string; state: StepState }[] {
  const rejected = proposal.status === "rejected";
  const approved = proposal.status === "approved";
  return [
    { label: "품의", state: rejected ? "fail" : approved ? "done" : "now" },
    { label: "발주", state: flow.orderDone ? "done" : flow.canOrder ? "now" : "idle" },
    { label: "입고", state: flow.received ? "done" : flow.sent || flow.onlineOrdered ? "now" : "idle" },
  ];
}

/** 줄 오른쪽에 보여 줄 현재 상태 글자들 (가장 시급한 것부터) */
export function purchaseStatusChips(proposal: Proposal, flow: PurchaseFlow): { label: string; tone: "green" | "red" | "orange" | "blue" | "gray" }[] {
  if (proposal.status === "rejected") return [{ label: "반려됨", tone: "red" }];
  if (proposal.status === "pending") return [{ label: "결재 중", tone: "orange" }];
  if (!flow.orderDone) return [{ label: "미발주", tone: "red" }];
  if (flow.received) return [flow.docsMissing ? { label: "서류 미등록", tone: "red" } : { label: "서류 등록 완료", tone: "green" }];
  const chips: { label: string; tone: "green" | "red" | "orange" | "blue" | "gray" }[] = [{ label: "입고 대기", tone: "orange" }];
  if (proposal.order_sent_at && !proposal.payment_method) chips.push({ label: "외상", tone: "red" });
  return chips;
}

const TONE: Record<string, string> = {
  green: "bg-tile-green text-tile-green-fg",
  red: "bg-[#fef2f2] text-danger",
  orange: "bg-tile-orange text-tile-orange-fg",
  blue: "bg-tile-blue text-tile-blue-fg",
  gray: "bg-[#f1f2f4] text-text-muted",
};

const DOT: Record<StepState, string> = {
  done: "bg-tile-green-fg text-white",
  now: "bg-primary text-white",
  fail: "bg-danger text-white",
  idle: "bg-[#eceef2] text-text-muted",
};

/**
 * 프로젝트 상세: 이 프로젝트에 연결된 구매 품의서를 한 건당 한 줄로 보여 준다 (품의서에서 프로젝트를 고른 건).
 * 건마다 품의 → 발주 → 입고 진행 상태와 금액, 현재 상태가 나온다. 줄을 누르면 전자결재 화면으로 간다.
 */
export function ProjectPurchaseList({ projectId }: { projectId: number }) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [orders, setOrders] = useState<ProjectDocument[]>([]);

  useEffect(() => {
    logDebug("ProjectPurchase", `프로젝트 구매 목록 조회: project_id=${projectId}`);
    Promise.all([apiGet<Proposal[]>("/api/proposals"), apiGet<ProjectDocument[]>("/api/project-documents?doc_type=purchase_order")])
      .then(([list, orderList]) => {
        setProposals(list.filter((p) => isPurchaseProposal(p) && p.project_id === projectId));
        setOrders(orderList);
      })
      .catch((err) => {
        logError("ProjectPurchase", "프로젝트 구매 목록 조회 실패", err);
        setProposals([]);
      });
  }, [projectId]);

  const sorted = [...(proposals ?? [])].sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.id - a.id);

  return (
    <section className="mb-6" aria-label="프로젝트 구매">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-medium text-text-muted">구매</h2>
        {proposals !== null && <span className="text-xs text-text-muted">{sorted.length}건</span>}
      </div>

      {proposals === null && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {proposals !== null && sorted.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
          이 프로젝트에 연결된 구매가 아직 없습니다.
          <br />
          구매 품의서를 쓸 때 이 프로젝트를 선택하면 여기에 나타납니다.
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {sorted.map((p) => {
          const flow = computePurchaseFlow(p, orders);
          const summary = summarizeOrders(flow.activeOrders) ?? summarizeProposal(p);
          const steps = purchaseSteps(p, flow);
          const chips = purchaseStatusChips(p, flow);
          return (
            <Link
              key={p.id}
              to="/approval"
              className="grid grid-cols-1 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:border-primary/40 sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)] sm:gap-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" title={p.title}>
                  {p.title}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {summary?.client && summary.client !== "-" ? `${summary.client} · ` : ""}
                  {p.issue_date}
                </p>
              </div>
              <ol className="flex items-center gap-1" aria-label="진행 단계">
                {steps.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-1">
                    <span className="flex min-w-[46px] flex-col items-center gap-0.5">
                      <span className={`grid h-[26px] w-[26px] place-items-center rounded-full text-xs font-bold ${DOT[s.state]}`} aria-label={`${s.label} ${s.state === "done" ? "완료" : s.state === "now" ? "진행 중" : s.state === "fail" ? "반려" : "대기"}`}>
                        {s.state === "done" ? "✓" : s.state === "fail" ? "✕" : i + 1}
                      </span>
                      <span className="text-[11px] text-text-muted">{s.label}</span>
                    </span>
                    {i < steps.length - 1 && <span className="text-text-muted">→</span>}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-end sm:gap-1">
                <b className="text-sm tabular-nums">{summary?.total ?? "-"}</b>
                <span className="flex flex-wrap gap-1">
                  {chips.map((c) => (
                    <span key={c.label} className={`whitespace-nowrap rounded-full px-2 py-px text-[11.5px] font-semibold ${TONE[c.tone]}`}>
                      {c.label}
                    </span>
                  ))}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
