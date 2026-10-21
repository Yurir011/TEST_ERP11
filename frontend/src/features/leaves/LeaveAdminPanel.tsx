import { Settings2, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiGet, apiPost } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { formatServiceLength, formatSignedDays } from "./leaveBalance";
import type { LeaveAdjustment, LeaveBalanceRow } from "./types";

/** 관리자: 직원별 연차 현황(입사일 기준 자동 발생 + 조정 − 사용)을 보고, 일수를 더하거나 빼서 조정한다. */
export function LeaveAdminPanel({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<LeaveBalanceRow[] | null>(null);
  const [target, setTarget] = useState<LeaveBalanceRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    logDebug("LeaveAdmin", "직원별 연차 현황 조회");
    apiGet<LeaveBalanceRow[]>("/api/leaves/balances")
      .then(setRows)
      .catch((err) => {
        logError("LeaveAdmin", "직원별 연차 현황 조회 실패", err);
        setError("직원별 연차 현황을 불러오지 못했습니다.");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleChanged() {
    load();
    onChanged(); // 내 연차 카드도 새로 불러온다
  }

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold mb-1">직원별 연차 현황 (관리자)</h2>
      <p className="text-xs text-text-muted mb-3">
        입사일을 기준으로 근로기준법에 따라 자동 발생합니다(1년 미만은 개근한 달마다 1일, 1년 이상은 15일에 2년마다 1일 추가, 최대 25일). 입사일은 설정 &gt; 직원 정보에서 바꿀 수 있습니다.
        필요하면 일수를 더하거나 빼서 조정하세요.
      </p>
      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      {rows === null && !error && <p className="text-sm text-text-muted">불러오는 중...</p>}
      {rows !== null && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-muted border-b border-border">
                <th className="text-left font-medium px-4 py-2.5">직원</th>
                <th className="text-left font-medium px-3 py-2.5">입사일 (근속)</th>
                <th className="text-right font-medium px-3 py-2.5">자동 발생</th>
                <th className="text-right font-medium px-3 py-2.5">조정</th>
                <th className="text-right font-medium px-3 py-2.5">이월 차감</th>
                <th className="text-right font-medium px-3 py-2.5">사용</th>
                <th className="text-right font-medium px-3 py-2.5">잔여</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.user_name}</td>
                  <td className="px-3 py-2.5 text-text-muted tabular-nums">
                    {r.hire_date} · {r.hire_date ? formatServiceLength(r.hire_date) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.auto_granted}일</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.adjustment === 0 ? "-" : formatSignedDays(r.adjustment)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.carried_deficit === 0 ? "-" : `-${r.carried_deficit}일`}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.used}일</td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${r.remaining < 0 ? "text-danger" : "text-primary"}`}>
                    {formatSignedDays(r.remaining, false)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setTarget(r)}
                      aria-label={`${r.user_name} 연차 조정`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-bg"
                    >
                      <Settings2 size={13} />
                      조정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target && <AdjustmentModal row={target} onClose={() => setTarget(null)} onChanged={handleChanged} />}
    </section>
  );
}

function AdjustmentModal({ row, onClose, onChanged }: { row: LeaveBalanceRow; onClose: () => void; onChanged: () => void }) {
  const { confirm } = useDialog();
  const [history, setHistory] = useState<LeaveAdjustment[] | null>(null);
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    apiGet<LeaveAdjustment[]>(`/api/leaves/adjustments?user_id=${row.user_id}`)
      .then(setHistory)
      .catch((err) => logError("LeaveAdmin", "조정 내역 조회 실패", err));
  }, [row.user_id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(days);
    if (!Number.isInteger(n) || n === 0) {
      setError("조정 일수는 0이 아닌 정수로 입력해주세요. (더하면 +, 빼면 -)");
      return;
    }
    setError(null);
    setSaving(true);
    logDebug("LeaveAdmin", `연차 조정: user_id=${row.user_id}, days=${n}`);
    try {
      await apiPost("/api/leaves/adjustments", { user_id: row.user_id, days: n, reason: reason.trim(), effective_date: date });
      setDays("");
      setReason("");
      loadHistory();
      onChanged();
    } catch (err) {
      logError("LeaveAdmin", "연차 조정 실패", err);
      setError(err instanceof ApiError ? err.message : "연차를 조정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(a: LeaveAdjustment) {
    if (!(await confirm(`${a.effective_date} ${formatSignedDays(a.days)} 조정을 취소할까요?`, { okLabel: "조정 취소", danger: true }))) return;
    try {
      await apiDelete(`/api/leaves/adjustments/${a.id}`);
      loadHistory();
      onChanged();
    } catch (err) {
      logError("LeaveAdmin", "연차 조정 취소 실패", err);
      setError(err instanceof ApiError ? err.message : "조정을 취소하지 못했습니다.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${row.user_name} 연차 조정`} className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-surface border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-semibold">{row.user_name} 연차 조정</h2>
            <p className="text-xs text-text-muted mt-0.5">
              현재 잔여 {formatSignedDays(row.remaining, false)} (자동 발생 {row.auto_granted}일, 조정 {formatSignedDays(row.adjustment)}, 사용 {row.used}일)
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded text-text-muted hover:bg-bg hover:text-text">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-bg p-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <label className="text-xs text-text-muted">
              조정 일수 (더하면 +, 빼면 -)
              <input
                type="number"
                step={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                aria-label="조정 일수"
                placeholder="예: 2 또는 -1"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
              />
            </label>
            <label className="text-xs text-text-muted">
              적용 날짜
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="적용 날짜"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
              />
            </label>
          </div>
          <label className="text-xs text-text-muted">
            사유
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              aria-label="조정 사유"
              placeholder="예: 포상 휴가, 이전 직장 경력 인정"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
            />
          </label>
          <p className="text-[11px] text-text-muted">적용 날짜가 속한 연차 주기(입사일 기준 1년)의 발생 일수에 더해집니다.</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={saving || !days || !reason.trim()} className="self-end rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50">
            조정 저장
          </button>
        </form>

        <p className="mt-4 mb-1.5 text-xs text-text-muted">조정 내역</p>
        {history === null && <p className="text-xs text-text-muted">불러오는 중...</p>}
        {history !== null && history.length === 0 && <p className="rounded-lg bg-bg px-3 py-2 text-xs text-text-muted">조정한 내역이 없습니다.</p>}
        <ul className="flex flex-col gap-1">
          {(history ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm">
              <b className={`w-12 shrink-0 tabular-nums ${a.days < 0 ? "text-danger" : "text-primary"}`}>{formatSignedDays(a.days)}</b>
              <span className="min-w-0 flex-1 truncate" title={a.reason}>
                {a.reason}
              </span>
              <span className="shrink-0 text-[11px] text-text-muted tabular-nums">
                {a.effective_date} · {a.created_by_name ?? "-"}
              </span>
              <button type="button" onClick={() => handleDelete(a)} aria-label="조정 취소" title="조정 취소" className="p-1 rounded text-text-muted hover:text-danger">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
