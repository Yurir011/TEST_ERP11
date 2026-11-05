import { Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApprovalChainPicker, type ApprovalEndTitle } from "../../components/approval/ApprovalChainPicker";
import { FinalDecisionCheckbox } from "../../components/approval/FinalDecisionCheckbox";
import { WITHDRAW_CONFIRM_MESSAGE, canWithdrawApproval } from "../../components/approval/withdraw";
import { useAuth } from "../../context/useAuth";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { LeaveBalance, LeaveRecord } from "../leaves/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";
import { useDialog } from "../../components/ui/dialog/useDialog";

export function MobileLeavesPage() {
  const { confirm, notify, notifyError } = useDialog();
  const { user } = useAuth();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [leaves, setLeaves] = useState<LeaveRecord[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  // 회수한 신청을 수정해 다시 올리는 중이면 그 신청 id (없으면 새 신청)
  const [resubmitId, setResubmitId] = useState<number | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isFinalDecision, setIsFinalDecision] = useState(false);
  const [endTitle, setEndTitle] = useState<ApprovalEndTitle | null>(null);
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load() {
    logDebug("MobileLeaves", "잔여 연차/내 신청 내역 조회");
    apiGet<LeaveBalance>("/api/leaves/balance")
      .then(setBalance)
      .catch((err) => logError("MobileLeaves", "잔여 연차 조회 실패", err));
    apiGet<LeaveRecord[]>("/api/leaves/me")
      .then(setLeaves)
      .catch((err) => {
        logError("MobileLeaves", "내 신청 내역 조회 실패", err);
        setLeaves([]);
      });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!isFinalDecision && (!endTitle || approverIds.some((id) => !id))) {
      setFormError("결재선의 종료 단계와 각 단계의 결재자를 모두 선택해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      logDebug("MobileLeaves", `연차 신청 시도: ${startDate}~${endDate}`);
      const body = {
        start_date: startDate,
        end_date: endDate || startDate,
        reason,
        is_final_decision: isFinalDecision,
        end_title: isFinalDecision ? null : endTitle,
        approver_ids: isFinalDecision ? [] : approverIds.map(Number),
      };
      if (resubmitId !== null) {
        logDebug("MobileLeaves", `회수한 신청 재신청: id=${resubmitId}`);
        await apiPut(`/api/leaves/${resubmitId}`, body);
      } else {
        await apiPost("/api/leaves", body);
      }
      setResubmitId(null);
      setShowForm(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      setEndTitle(null);
      setApproverIds([]);
      setIsFinalDecision(false);
      load();
      notify("연차 신청이 완료되었습니다.");
    } catch (err) {
      logError("MobileLeaves", "연차 신청 실패", err);
      setFormError(err instanceof ApiError ? err.message : "신청 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleWithdraw(id: number) {
    if (!(await confirm(WITHDRAW_CONFIRM_MESSAGE, { okLabel: "회수" }))) return;
    logDebug("MobileLeaves", `회수 요청: id=${id}`);
    try {
      await apiPost(`/api/leaves/${id}/withdraw`);
      load();
    } catch (err) {
      logError("MobileLeaves", "연차 회수 실패", err);
      notifyError(err instanceof ApiError ? err.message : "회수하지 못했습니다.");
    }
  }

  /** 회수한 신청의 내용을 신청 양식에 채워 넣고 연다 (결재선은 다시 고른다). */
  function startResubmit(l: LeaveRecord) {
    logDebug("MobileLeaves", `수정 후 재신청 시작: id=${l.id}`);
    setResubmitId(l.id);
    setStartDate(l.start_date);
    setEndDate(l.end_date);
    setReason(l.reason);
    setEndTitle(null);
    setApproverIds([]);
    setIsFinalDecision(false);
    setFormError(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCancel(id: number) {
    if (!(await confirm("이 연차 신청을 취소할까요?", { okLabel: "신청 취소", danger: true }))) return;
    try {
      await apiDelete(`/api/leaves/${id}`);
      load();
    } catch (err) {
      logError("MobileLeaves", "연차 취소 실패", err);
      notifyError(err instanceof ApiError ? err.message : "취소하지 못했습니다.");
    }
  }

  const ratio = balance && balance.granted > 0 ? Math.max(0, Math.min(100, (balance.remaining / balance.granted) * 100)) : 0;
  const inputClass = "w-full rounded-xl border border-border px-3 py-2.5 text-base outline-none focus:border-primary bg-bg";

  return (
    <MobileLayout title="연차">
      <MobileCard>
        <p className="text-xs text-text-muted">잔여 연차</p>
        <p className={`text-3xl font-extrabold mt-1 tabular-nums ${balance && balance.remaining < 0 ? "text-danger" : ""}`}>
          {balance ? balance.remaining : "-"}
          <span className="text-sm font-semibold text-text-muted"> / {balance ? balance.granted : "-"}일</span>
        </p>
        <div className="h-2 bg-bg rounded-full overflow-hidden mt-3">
          <div className="h-full bg-success rounded-full" style={{ width: `${ratio}%` }} />
        </div>
        {balance && (
          <p className="text-xs text-text-muted mt-2">
            사용 {balance.used}일 · 승인 대기 {balance.pending}일
          </p>
        )}
      </MobileCard>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover text-on-primary font-semibold py-3.5 rounded-xl"
        >
          <Plus size={18} />
          연차 신청하기
        </button>
      ) : (
        <MobileCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-sm font-semibold">연차 신청</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1.5" htmlFor="m-leave-start">
                  시작일
                </label>
                <input
                  id="m-leave-start"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5" htmlFor="m-leave-end">
                  종료일
                </label>
                <input
                  id="m-leave-end"
                  type="date"
                  required
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5" htmlFor="m-leave-reason">
                사유
              </label>
              <input
                id="m-leave-reason"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 개인 사유"
                className={inputClass}
              />
            </div>
            <FinalDecisionCheckbox checked={isFinalDecision} onChange={setIsFinalDecision} />
            {!isFinalDecision && (
              <ApprovalChainPicker
                endTitle={endTitle}
                onEndTitleChange={setEndTitle}
                approverIds={approverIds}
                onApproverIdsChange={setApproverIds}
              />
            )}
            {formError && <p className="text-xs text-danger">{formError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setResubmitId(null);
                }}
                className="flex-1 border border-border rounded-xl py-3 text-sm text-text-muted"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-primary text-on-primary rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
              >
                {isSubmitting ? "신청 중..." : resubmitId !== null ? "다시 신청" : "신청"}
              </button>
            </div>
          </form>
        </MobileCard>
      )}

      <h2 className="text-sm font-semibold px-1">내 신청 내역</h2>
      <MobileCard className="py-1">
        {leaves === null ? (
          <p className="text-xs text-text-muted py-6 text-center">불러오는 중...</p>
        ) : leaves.length === 0 ? (
          <MobileEmpty text="신청 내역이 없습니다." />
        ) : (
          <ul>
            {leaves.map((l) => (
              <li key={l.id} className="py-3 border-b border-border last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium tabular-nums">
                    {l.start_date === l.end_date ? l.start_date : `${l.start_date} ~ ${l.end_date}`} · {l.days}일
                  </p>
                  <StatusBadge status={l.status} />
                </div>
                <p className="text-xs text-text-muted mt-1">{l.reason}</p>
                {l.status === "rejected" && l.reject_reason && (
                  <p className="text-xs text-danger mt-1">반려 사유: {l.reject_reason}</p>
                )}
                {l.status === "pending" &&
                  (canWithdrawApproval({ status: l.status, creatorId: l.user_id, userId: user?.id, steps: l.steps }) ? (
                    <button type="button" onClick={() => handleWithdraw(l.id)} className="text-xs text-text-muted underline mt-2">
                      회수
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleCancel(l.id)} className="text-xs text-text-muted underline mt-2">
                      신청 취소
                    </button>
                  ))}
                {l.status === "withdrawn" && (
                  <div className="flex items-center gap-4 mt-2">
                    <button type="button" onClick={() => startResubmit(l)} className="text-xs text-primary underline">
                      수정 후 재신청
                    </button>
                    <button type="button" onClick={() => handleCancel(l.id)} className="text-xs text-text-muted underline">
                      폐기
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </MobileCard>
    </MobileLayout>
  );
}
