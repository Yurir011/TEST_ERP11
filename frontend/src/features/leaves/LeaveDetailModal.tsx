import { Check, X } from "lucide-react";
import { ApprovalStampTable } from "../../components/approval/ApprovalStampTable";
import { useAuth } from "../../context/AuthContext";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatDate } from "../../lib/format";
import type { LeaveRecord } from "./types";

const TITLE_LABELS = { dept_head: "부서장", team_lead: "팀장", ceo: "대표" } as const;

export function LeaveDetailModal({
  leave,
  isBusy,
  onClose,
  onApprove,
  onReject,
}: {
  leave: LeaveRecord;
  isBusy: boolean;
  onClose: () => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const { user } = useAuth();
  const currentStep = leave.steps.find((s) => s.step_order === leave.current_step);
  const canDecide = leave.status === "pending" && currentStep?.approver_id === user?.id;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">연차 신청</h3>
            <p className="text-xs text-text-muted mt-1">신청일 {formatDate(leave.created_at)}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <StatusBadge status={leave.status} />
          {leave.status === "pending" && currentStep && (
            <span className="text-xs text-text-muted">
              현재 결재 대기: {TITLE_LABELS[currentStep.title]} {currentStep.approver_name}
            </span>
          )}
        </div>

        <ApprovalStampTable steps={leave.steps} currentStep={leave.current_step} docStatus={leave.status} />

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <p className="text-xs text-text-muted mb-0.5">신청자</p>
            <p className="font-medium">{leave.user_name}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-0.5">연차 일수</p>
            <p className="font-medium">{leave.days}일</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-text-muted mb-0.5">기간</p>
            <p className="font-medium">
              {leave.start_date} ~ {leave.end_date}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-text-muted mb-0.5">사유</p>
            <p className="font-medium whitespace-pre-wrap">{leave.reason || "사유 미기재"}</p>
          </div>
          {leave.reviewed_at && (
            <div>
              <p className="text-xs text-text-muted mb-0.5">{leave.status === "rejected" ? "반려일" : "승인일"}</p>
              <p className="font-medium">{formatDate(leave.reviewed_at)}</p>
            </div>
          )}
        </div>

        {leave.status === "rejected" && leave.reject_reason && (
          <p className="text-sm text-danger bg-red-50 rounded-xl px-4 py-3 mb-4">반려 사유: {leave.reject_reason}</p>
        )}

        {canDecide && (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onReject(leave.id)}
              disabled={isBusy}
              className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-2 hover:bg-red-50 disabled:opacity-50"
            >
              <X size={14} />
              반려
            </button>
            <button
              onClick={() => onApprove(leave.id)}
              disabled={isBusy}
              className="flex items-center gap-1 text-xs text-success border border-success/30 rounded-lg px-3 py-2 hover:bg-tile-green disabled:opacity-50"
            >
              <Check size={14} />
              승인
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
