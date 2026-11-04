import { SOFT_BADGE } from "./softBadge";

type ApprovalStatus = "pending" | "approved" | "rejected" | "withdrawn";

const styles: Record<ApprovalStatus, string> = {
  pending: SOFT_BADGE.orange,
  approved: SOFT_BADGE.green,
  rejected: SOFT_BADGE.red,
  withdrawn: SOFT_BADGE.gray,
};

const labels: Record<ApprovalStatus, string> = {
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
  withdrawn: "회수됨",
};

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span className={`text-xs px-2 py-1 font-medium ${styles[status]}`}>{labels[status]}</span>
  );
}
