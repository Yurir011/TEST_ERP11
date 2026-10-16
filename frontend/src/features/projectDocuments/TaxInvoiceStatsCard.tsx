import { TrendingDown, TrendingUp } from "lucide-react";
import { computeTaxInvoiceStats } from "./documentHelpers";
import type { ProjectDocument } from "./types";

// "세금계산서 통계" 카드 — 이번 달/전월 발행 금액(전월 대비 증감)과 팝빌 미발행 건수.
interface TaxInvoiceStatsCardProps {
  docs: ProjectDocument[];
  monthFilter: "all" | "this" | "last";
  onToggleMonth: (value: "this" | "last") => void;
  issuedFilter: "all" | "issued" | "not_issued";
  onToggleIssued: (value: "issued" | "not_issued") => void;
}

export function TaxInvoiceStatsCard({ docs, monthFilter, onToggleMonth, issuedFilter, onToggleIssued }: TaxInvoiceStatsCardProps) {
  const s = computeTaxInvoiceStats(docs);
  const isUp = s.momChangePct >= 0;

  const cardBase = "bg-bg rounded-xl p-4 text-left w-full transition-colors hover:bg-border/40 cursor-pointer";
  const activeRing = "ring-2 ring-primary";

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      <h2 className="text-sm font-semibold mb-1">세금계산서 통계</h2>
      <p className="text-xs text-text-muted mb-4">카드를 클릭하면 아래 목록이 해당 조건으로 필터링됩니다.</p>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <button onClick={() => onToggleMonth("this")} className={`${cardBase} ${monthFilter === "this" ? activeRing : ""}`}>
          <p className="text-xs text-text-muted">이번 달 발행 금액</p>
          <p className="text-lg font-semibold mt-1">₩{s.thisMonthAmount.toLocaleString()}</p>
          <p className={`text-xs mt-1.5 flex items-center gap-1 ${isUp ? "text-success" : "text-danger"}`}>
            {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            전월 대비 {isUp ? "+" : ""}
            {s.momChangePct.toFixed(1)}%
          </p>
        </button>
        <button onClick={() => onToggleMonth("last")} className={`${cardBase} ${monthFilter === "last" ? activeRing : ""}`}>
          <p className="text-xs text-text-muted">전월 발행 금액</p>
          <p className="text-lg font-semibold mt-1 text-text-muted">₩{s.lastMonthAmount.toLocaleString()}</p>
          <p className="text-xs text-text-muted mt-1.5">{s.lastMonthCount}건</p>
        </button>
        <button onClick={() => onToggleIssued("not_issued")} className={`${cardBase} ${issuedFilter === "not_issued" ? activeRing : ""}`}>
          <p className="text-xs text-text-muted">팝빌 미발행</p>
          <p className="text-lg font-semibold mt-1 text-tile-orange-fg">{s.notIssuedCount}건</p>
          <p className="text-xs text-text-muted mt-1.5">전체 {s.totalCount}건 중</p>
        </button>
      </div>
    </div>
  );
}
