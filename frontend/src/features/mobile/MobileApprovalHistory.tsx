import { useEffect, useState } from "react";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { logError } from "../../lib/logger";
import { MobileCard, MobileEmpty } from "./MobileLayout";
import { loadApprovalHistory, type ApprovalHistoryItem } from "./myApprovals";

const DOC_STATUS_LABELS: Record<string, string> = {
  pending: "결재 진행 중",
  approved: "최종 승인됨",
  rejected: "반려됨",
  withdrawn: "작성자가 회수함",
  draft: "작성 중",
};

function shortDateTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/** [처리 내역] 탭: 내가 승인·반려한 결재를 최근 순으로 보여 준다. */
export function MobileApprovalHistory() {
  const [items, setItems] = useState<ApprovalHistoryItem[] | null>(null);

  useEffect(() => {
    loadApprovalHistory()
      .then(setItems)
      .catch((err) => {
        logError("MobileApproval", "처리 내역 조회 실패", err);
        setItems([]);
      });
  }, []);

  if (items === null) return <p className="text-xs text-text-muted text-center py-10">불러오는 중...</p>;
  if (items.length === 0) return <MobileEmpty text="처리한 결재가 없습니다." />;

  return (
    <>
      <p className="text-xs text-text-muted px-1">내가 처리한 결재 최근 {items.length}건</p>
      {items.map((item) => (
        <MobileCard key={`${item.kind}-${item.id}-${item.decided_at}`} className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 ${SOFT_BADGE.blue}`}>{item.kind_label}</span>
            <span className={`text-xs px-2 py-1 font-medium ${item.result === "approved" ? SOFT_BADGE.green : SOFT_BADGE.red}`}>
              내가 {item.result === "approved" ? "승인" : "반려"}
            </span>
          </div>
          <p className="text-sm font-semibold break-words">{item.title}</p>
          <p className="text-xs text-text-muted break-words">{item.subtitle}</p>
          <p className="text-[11px] text-text-muted tabular-nums">
            {shortDateTime(item.decided_at)} 처리 · 지금은 {DOC_STATUS_LABELS[item.doc_status] ?? item.doc_status}
          </p>
        </MobileCard>
      ))}
    </>
  );
}
