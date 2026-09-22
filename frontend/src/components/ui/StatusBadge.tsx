type ApprovalStatus = "pending" | "approved" | "rejected";

const styles: Record<ApprovalStatus, string> = {
  pending: "bg-tile-orange text-tile-orange-fg",
  approved: "bg-tile-green text-tile-green-fg",
  rejected: "bg-red-50 text-danger",
};

const labels: Record<ApprovalStatus, string> = {
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
};

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${styles[status]}`}>{labels[status]}</span>
  );
}
