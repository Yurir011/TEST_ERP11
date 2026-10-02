import { CalendarRange, ChevronLeft, ChevronRight, Check, Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApprovalChainPicker, type ApprovalEndTitle } from "../../components/approval/ApprovalChainPicker";
import { FinalDecisionCheckbox } from "../../components/approval/FinalDecisionCheckbox";
import { MainLayout } from "../../components/layout/MainLayout";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { openTargetDomId, useOpenTarget, useScrollToOpenTarget } from "../../lib/useOpenTarget";
import { LeaveDetailModal } from "./LeaveDetailModal";
import type { LeaveBalance, LeaveRecord } from "./types";

function toMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

interface LeavesPageProps {
  embedded?: boolean;
}

export function LeavesPage({ embedded = false }: LeavesPageProps) {
  const now = new Date();

  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [myLeaves, setMyLeaves] = useState<LeaveRecord[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRecord[]>([]);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [teamCalendar, setTeamCalendar] = useState<LeaveRecord[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [endTitle, setEndTitle] = useState<ApprovalEndTitle | null>(null);
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [isFinalDecision, setIsFinalDecision] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const openTargetId = useOpenTarget();
  useScrollToOpenTarget(openTargetId, myLeaves.length > 0 || pendingLeaves.length > 0);
  const [detail, setDetail] = useState<LeaveRecord | null>(null);

  // 업무 알림(?open=연차ID)으로 들어오면 해당 신청 건의 상세 화면을 바로 열고, 결재권자는 그 자리에서 승인/반려할 수 있다.
  useEffect(() => {
    if (openTargetId === null) return;
    logDebug("Leaves", `알림에서 연차 상세 열기: id=${openTargetId}`);
    apiGet<LeaveRecord>(`/api/leaves/${openTargetId}`)
      .then(setDetail)
      .catch((err) => logError("Leaves", "연차 상세 조회 실패", err));
  }, [openTargetId]);

  function loadBalance() {
    apiGet<LeaveBalance>("/api/leaves/balance")
      .then(setBalance)
      .catch((err) => logError("Leaves", "잔여 연차 조회 실패", err));
  }

  function loadMyLeaves() {
    apiGet<LeaveRecord[]>("/api/leaves/me")
      .then(setMyLeaves)
      .catch((err) => logError("Leaves", "내 연차 목록 조회 실패", err));
  }

  function loadPending() {
    apiGet<LeaveRecord[]>("/api/leaves?status=pending&approver_mine=true")
      .then(setPendingLeaves)
      .catch((err) => logError("Leaves", "승인 대기 목록 조회 실패", err));
  }

  function loadTeamCalendar() {
    apiGet<LeaveRecord[]>(`/api/leaves/team-calendar?year=${calYear}&month=${calMonth}`)
      .then(setTeamCalendar)
      .catch((err) => logError("Leaves", "팀 연차 캘린더 조회 실패", err));
  }

  useEffect(() => {
    loadBalance();
    loadMyLeaves();
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTeamCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calYear, calMonth]);

  function shiftCalMonth(delta: number) {
    let m = calMonth + delta;
    let y = calYear;
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    setCalYear(y);
    setCalMonth(m);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!isFinalDecision && (!endTitle || approverIds.some((id) => !id))) {
      setFormError("결재선의 종료 단계와 각 단계의 결재자를 모두 선택해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiPost("/api/leaves", {
        start_date: startDate,
        end_date: endDate,
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
      loadBalance();
      loadMyLeaves();
      loadPending();
      logDebug("Leaves", "신청 완료, 목록 새로고침");
      window.alert("연차 신청이 완료되었습니다.");
    } catch (err) {
      logError("Leaves", "신청 실패", err);
      setFormError(err instanceof ApiError ? err.message : "신청 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(id: number) {
    if (!window.confirm("이 연차 신청을 취소할까요?")) return;
    try {
      await apiDelete(`/api/leaves/${id}`);
      loadBalance();
      loadMyLeaves();
    } catch (err) {
      logError("Leaves", "취소 실패", err);
    }
  }

  async function handleApprove(id: number) {
    setBusyId(id);
    try {
      await apiPut(`/api/leaves/${id}/approve`);
      setDetail(null);
      loadPending();
      loadMyLeaves();
      loadBalance();
      loadTeamCalendar();
      window.alert("결재 승인되었습니다.");
    } catch (err) {
      logError("Leaves", "승인 처리 실패", err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: number) {
    const reason = window.prompt("반려 사유를 입력해주세요.");
    if (!reason || !reason.trim()) return;
    setBusyId(id);
    try {
      await apiPut(`/api/leaves/${id}/reject`, { reason: reason.trim() });
      setDetail(null);
      loadPending();
      loadMyLeaves();
      loadBalance();
      loadTeamCalendar();
    } catch (err) {
      logError("Leaves", "반려 처리 실패", err);
    } finally {
      setBusyId(null);
    }
  }

  const content = (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? "닫기" : "연차 신청"}
        </button>
      </div>

      {balance && (
        <section className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text-muted">발생 연차</p>
            <p className="text-2xl font-semibold mt-1">{balance.granted}일</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text-muted">사용</p>
            <p className="text-2xl font-semibold mt-1">{balance.used}일</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text-muted">승인 대기</p>
            <p className="text-2xl font-semibold mt-1">{balance.pending}일</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text-muted">잔여</p>
            <p className="text-2xl font-semibold mt-1 text-primary">{balance.remaining}일</p>
          </div>
        </section>
      )}
      {balance && (
        <p className="text-xs text-text-muted mb-6">
          현재 산정 기간: {balance.period_start} ~ {balance.period_end}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 mb-8 max-w-xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">시작일</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">종료일</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">사유</label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y"
              placeholder="연차 사유를 입력하세요"
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
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? "신청 중..." : "신청하기"}
          </button>
        </form>
      )}

      {pendingLeaves.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-text-muted mb-3">내 결재함 - 승인 대기 중인 신청</h2>
          <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
            {pendingLeaves.map((l) => (
              <div
                key={l.id}
                id={openTargetDomId(l.id)}
                className={`flex items-center justify-between px-5 py-4 ${l.id === openTargetId ? "bg-tile-blue" : ""}`}
              >
                <div>
                  <p className="text-sm font-medium">
                    {l.user_name} · {l.start_date} ~ {l.end_date} ({l.days}일)
                  </p>
                  <p className="text-xs text-text-muted mt-1">{l.reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(l.id)}
                    disabled={busyId === l.id}
                    className="flex items-center gap-1 text-xs text-success border border-success/30 rounded-lg px-3 py-1.5 hover:bg-tile-green disabled:opacity-50"
                  >
                    <Check size={14} />
                    승인
                  </button>
                  <button
                    onClick={() => handleReject(l.id)}
                    disabled={busyId === l.id}
                    className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
                  >
                    <X size={14} />
                    반려
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-sm font-medium text-text-muted mb-3">내 연차 신청 내역</h2>
        {myLeaves.length === 0 ? (
          <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
            <p className="text-sm text-text-muted">신청 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
            {myLeaves.map((l) => (
              <div
                key={l.id}
                id={openTargetDomId(l.id)}
                className={`flex items-center justify-between px-5 py-4 ${l.id === openTargetId ? "bg-tile-blue" : ""}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {l.start_date} ~ {l.end_date} ({l.days}일)
                    </p>
                    <StatusBadge status={l.status} />
                  </div>
                  <p className="text-xs text-text-muted mt-1">{l.reason}</p>
                  {l.approver_name && (
                    <p className="text-xs text-text-muted mt-0.5">
                      결재권자: {l.approver_name}
                      {l.is_final_decision && <span className="text-primary font-medium"> (전결)</span>}
                      {!l.is_final_decision && l.steps.length > 1 && (
                        <span> · {l.current_step}/{l.steps.length}단계</span>
                      )}
                    </p>
                  )}
                  {l.status === "rejected" && l.reject_reason && (
                    <p className="text-xs text-danger mt-0.5">반려 사유: {l.reject_reason}</p>
                  )}
                </div>
                {l.status === "pending" && (
                  <button
                    onClick={() => handleCancel(l.id)}
                    className="text-xs text-text-muted hover:text-danger border border-border rounded-lg px-3 py-1.5 shrink-0"
                  >
                    취소
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-text-muted flex items-center gap-1.5">
            <CalendarRange size={15} />팀 연차 현황
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={() => shiftCalMonth(-1)} className="p-1.5 rounded-lg hover:bg-surface text-text-muted">
              <ChevronLeft size={16} />
            </button>
            <input
              type="month"
              value={toMonthValue(calYear, calMonth)}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                if (y && m) {
                  setCalYear(y);
                  setCalMonth(m);
                }
              }}
              className="text-sm border border-border rounded-lg px-2 py-1 outline-none focus:border-primary bg-bg"
            />
            <button onClick={() => shiftCalMonth(1)} className="p-1.5 rounded-lg hover:bg-surface text-text-muted">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          {teamCalendar.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">해당 월에 승인된 팀 연차가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {teamCalendar.map((l) => (
                <li key={l.id} className="flex items-center justify-between bg-bg rounded-xl px-4 py-3 text-sm">
                  <span>
                    {l.user_name} · {l.start_date} ~ {l.end_date}
                  </span>
                  <span className="text-xs text-text-muted">{l.days}일</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      {detail && (
        <LeaveDetailModal
          leave={detail}
          isBusy={busyId === detail.id}
          onClose={() => setDetail(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </>
  );

  if (embedded) return content;

  return (
    <MainLayout title="연차관리" description="연차를 신청하고 승인 현황을 확인합니다.">
      {content}
    </MainLayout>
  );
}
