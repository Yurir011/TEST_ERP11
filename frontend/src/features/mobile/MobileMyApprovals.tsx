import { useCallback, useEffect, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { WITHDRAW_CONFIRM_MESSAGE } from "../../components/approval/withdraw";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { MobileCard, MobileEmpty } from "./MobileLayout";
import { loadMyApprovals, type MyApprovalItem } from "./myApprovals";
import { invalidateMobileBadges } from "./useMobileBadges";

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** [내가 올린 문서] 탭: 올린 결재의 진행 상태를 보고, 승인 전이면 회수, 회수한 문서는 폐기한다. */
export function MobileMyApprovals() {
  const { user } = useAuth();
  const { confirm } = useDialog();
  const [items, setItems] = useState<MyApprovalItem[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!user) return;
    void loadMyApprovals(user.id).then(setItems);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleWithdraw(item: MyApprovalItem) {
    if (!(await confirm(WITHDRAW_CONFIRM_MESSAGE, { okLabel: "회수" }))) return;
    setError(null);
    setBusyKey(item.key);
    try {
      logDebug("MobileApproval", `회수 시도: ${item.key}`);
      await apiPost(`${item.basePath}/withdraw`);
      invalidateMobileBadges();
      reload();
    } catch (err) {
      logError("MobileApproval", `회수 실패: ${item.key}`, err);
      setError(err instanceof ApiError ? err.message : "회수하지 못했습니다.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDiscard(item: MyApprovalItem) {
    if (!(await confirm(`${item.kindLabel} "${item.title}"을(를) 폐기할까요?`, { okLabel: "폐기", danger: true }))) return;
    setError(null);
    setBusyKey(item.key);
    try {
      logDebug("MobileApproval", `폐기 시도: ${item.key}`);
      await apiDelete(item.basePath);
      reload();
    } catch (err) {
      logError("MobileApproval", `폐기 실패: ${item.key}`, err);
      setError(err instanceof ApiError ? err.message : "폐기하지 못했습니다.");
    } finally {
      setBusyKey(null);
    }
  }

  if (items === null) return <p className="text-xs text-text-muted text-center py-10">불러오는 중...</p>;
  if (items.length === 0) return <MobileEmpty text="올린 결재 문서가 없습니다." />;

  return (
    <>
      {error && <p className="text-xs text-danger px-1">{error}</p>}
      <p className="text-xs text-text-muted px-1">최근 {items.length}건 · 문서 작성과 수정은 PC에서 합니다.</p>
      {items.map((item) => (
        <MobileCard key={item.key} className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 ${SOFT_BADGE.blue}`}>{item.kindLabel}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-text-muted tabular-nums">{shortDate(item.date)}</span>
              {item.status === "draft" ? (
                <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.gray}`}>작성 중</span>
              ) : (
                <StatusBadge status={item.status} />
              )}
            </div>
          </div>
          <p className="text-sm font-semibold break-words">{item.title}</p>
          <p className="text-xs text-text-muted break-words">{item.note}</p>
          {item.status === "pending" && !item.canWithdraw && (
            <p className="text-[11px] text-text-muted">다른 결재자가 이미 승인해 회수할 수 없어요.</p>
          )}
          {(item.canWithdraw || item.canDiscard) && (
            <div className="flex gap-2 pt-1">
              {item.canWithdraw && (
                <button
                  type="button"
                  disabled={busyKey === item.key}
                  onClick={() => handleWithdraw(item)}
                  className="border border-border rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  회수
                </button>
              )}
              {item.canDiscard && (
                <button
                  type="button"
                  disabled={busyKey === item.key}
                  onClick={() => handleDiscard(item)}
                  className="border border-danger/30 rounded-xl px-4 py-2 text-sm font-medium text-danger disabled:opacity-60"
                >
                  폐기
                </button>
              )}
            </div>
          )}
        </MobileCard>
      ))}
    </>
  );
}
