import { FileText } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, apiPut, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { useApprovalQueue, type ApprovalItem } from "./approvalQueue";
import { MobileApprovalHistory } from "./MobileApprovalHistory";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";
import { MobileMyApprovals } from "./MobileMyApprovals";
import { invalidateMobileBadges } from "./useMobileBadges";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { useDialog } from "../../components/ui/dialog/useDialog";

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 문서 미리보기 경로 (연차는 PDF가 없다). */
function previewPath(item: ApprovalItem): string | null {
  if (item.kind === "document") return `${item.basePath}/download`;
  if (item.kind === "project" || item.kind === "proposal") return `${item.basePath}/pdf`;
  return null;
}

function PendingTab() {
  const { confirm } = useDialog();
  const { items, reload } = useApprovalQueue();
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove(item: ApprovalItem) {
    if (!(await confirm(`${item.kindLabel} "${item.title}"을(를) 승인할까요?`, { okLabel: "승인" }))) return;
    setError(null);
    setBusyKey(item.key);
    try {
      logDebug("MobileApproval", `승인 시도: ${item.key}`);
      await apiPut(`${item.basePath}/approve`);
      invalidateMobileBadges();
      reload();
    } catch (err) {
      logError("MobileApproval", `승인 실패: ${item.key}`, err);
      setError(err instanceof ApiError ? err.message : "승인 중 오류가 발생했습니다.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleReject(item: ApprovalItem) {
    if (!reason.trim()) {
      setError("반려 사유를 입력해주세요.");
      return;
    }
    setError(null);
    setBusyKey(item.key);
    try {
      logDebug("MobileApproval", `반려 시도: ${item.key}`);
      await apiPut(`${item.basePath}/reject`, { reason: reason.trim() });
      setRejectingKey(null);
      setReason("");
      invalidateMobileBadges();
      reload();
    } catch (err) {
      logError("MobileApproval", `반려 실패: ${item.key}`, err);
      setError(err instanceof ApiError ? err.message : "반려 중 오류가 발생했습니다.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePreview(item: ApprovalItem) {
    const path = previewPath(item);
    if (!path) return;
    try {
      await openFile(path);
    } catch (err) {
      logError("MobileApproval", `문서 열기 실패: ${item.key}`, err);
      setError("문서를 열지 못했습니다.");
    }
  }

  return (
    <>
      {error && <p className="text-xs text-danger px-1">{error}</p>}

      {items === null ? (
        <p className="text-xs text-text-muted text-center py-10">불러오는 중...</p>
      ) : items.length === 0 ? (
        <MobileEmpty text="결재할 문서가 없습니다." />
      ) : (
        <>
          <p className="text-xs text-text-muted px-1">내가 결재할 문서 {items.length}건</p>
          {items.map((item) => {
            const rejecting = rejectingKey === item.key;
            const busy = busyKey === item.key;
            return (
              <MobileCard key={item.key} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 ${SOFT_BADGE.blue}`}>
                      {item.kindLabel}
                    </span>
                    <p className="text-sm font-semibold mt-1.5 break-words">{item.title}</p>
                    <p className="text-xs text-text-muted mt-0.5 break-words">{item.subtitle}</p>
                  </div>
                  <span className="text-xs text-text-muted shrink-0 tabular-nums">{shortDate(item.date)}</span>
                </div>

                {previewPath(item) && (
                  <button type="button" onClick={() => handlePreview(item)} className="flex items-center gap-1 text-xs text-primary">
                    <FileText size={14} />
                    문서 보기
                  </button>
                )}

                {rejecting ? (
                  <div className="space-y-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="반려 사유"
                      aria-label="반려 사유"
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-base outline-none focus:border-primary bg-bg"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingKey(null);
                          setReason("");
                          setError(null);
                        }}
                        className="flex-1 border border-border rounded-xl py-2.5 text-sm text-text-muted"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReject(item)}
                        className="flex-1 bg-danger text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                      >
                        반려하기
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRejectingKey(item.key);
                        setReason("");
                        setError(null);
                      }}
                      className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium text-danger disabled:opacity-60"
                    >
                      반려
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleApprove(item)}
                      className="flex-1 bg-primary hover:bg-primary-hover text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                    >
                      승인
                    </button>
                  </div>
                )}
              </MobileCard>
            );
          })}
        </>
      )}
    </>
  );
}

type Tab = "wait" | "mine" | "done";

const TABS: { key: Tab; label: string }[] = [
  { key: "wait", label: "결재할 문서" },
  { key: "mine", label: "내가 올린 문서" },
  { key: "done", label: "처리 내역" },
];

/** 모바일 결재: 결재할 문서(승인·반려), 내가 올린 문서(진행 상태·회수), 내가 처리한 내역을 세 칸으로 나눠 보여 준다. */
export function MobileApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "mine" || raw === "done" ? raw : "wait";

  return (
    <MobileLayout title="결재">
      <div role="group" aria-label="결재 보기" className="grid grid-cols-3 gap-0.5 bg-bg border border-border rounded-xl p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => {
              logDebug("MobileApproval", `결재 보기 전환: ${t.key}`);
              setParams(t.key === "wait" ? {} : { tab: t.key }, { replace: true });
            }}
            className={`py-2 rounded-[10px] text-[12.5px] font-semibold ${tab === t.key ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "wait" && <PendingTab />}
      {tab === "mine" && <MobileMyApprovals />}
      {tab === "done" && <MobileApprovalHistory />}
    </MobileLayout>
  );
}
