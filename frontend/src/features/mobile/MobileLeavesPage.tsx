import { Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApprovalChainPicker, type ApprovalEndTitle } from "../../components/approval/ApprovalChainPicker";
import { FinalDecisionCheckbox } from "../../components/approval/FinalDecisionCheckbox";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ApiError, apiDelete, apiGet, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { LeaveBalance, LeaveRecord } from "../leaves/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

export function MobileLeavesPage() {
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [leaves, setLeaves] = useState<LeaveRecord[] | null>(null);
  const [showForm, setShowForm] = useState(false);

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
      await apiPost("/api/leaves", {
        start_date: startDate,
        end_date: endDate || startDate,
        reason,
        is_final_decision: isFinalDecision,
        end_title: isFinalDecision ? null : endTitle,
        approver_ids: isFinalDecision ? [] : approverIds.map(Number),
      });
      setShowForm(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      setEndTitle(null);
      setApproverIds([]);
      setIsFinalDecision(false);
      load();
      window.alert("연차 신청이 완료되었습니다.");
    } catch (err) {
      logError("MobileLeaves", "연차 신청 실패", err);
      setFormError(err instanceof ApiError ? err.message : "신청 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(id: number) {
    if (!window.confirm("이 연차 신청을 취소할까요?")) return;
    try {
      await apiDelete(`/api/leaves/${id}`);
      load();
    } catch (err) {
      logError("MobileLeaves", "연차 취소 실패", err);
      window.alert(err instanceof ApiError ? err.message : "취소하지 못했습니다.");
    }
  }

  const ratio = balance && balance.granted > 0 ? Math.max(0, Math.min(100, (balance.remaining / balance.granted) * 100)) : 0;
  const inputClass = "w-full rounded-xl border border-border px-3 py-2.5 text-base outline-none focus:border-primary bg-bg";

  return (
    <MobileLayout title="연차">
      <MobileCard>
        <p className="text-xs text-text-muted">잔여 연차</p>
        <p className="text-3xl font-extrabold mt-1 tabular-nums">
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
          className="w-full flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover text-white font-semibold py-3.5 rounded-xl"
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
                onClick={() => setShowForm(false)}
                className="flex-1 border border-border rounded-xl py-3 text-sm text-text-muted"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-primary text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
              >
                {isSubmitting ? "신청 중..." : "신청"}
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
                {l.status === "pending" && (
                  <button type="button" onClick={() => handleCancel(l.id)} className="text-xs text-text-muted underline mt-2">
                    신청 취소
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </MobileCard>
    </MobileLayout>
  );
}
