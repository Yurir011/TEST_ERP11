import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { logError } from "../../lib/logger";
import { APPROVAL_ROUTE_LABELS, type Approver, type ApprovalRoute } from "./types";

const ROUTES: ApprovalRoute[] = ["chief", "manager", "self_decision"];

export function ApproverPickerModal({
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  isSubmitting: boolean;
  onConfirm: (route: ApprovalRoute, approverId: number | null) => void;
  onCancel: () => void;
}) {
  const [route, setRoute] = useState<ApprovalRoute>("chief");
  const [approvers, setApprovers] = useState<Approver[] | null>(null);
  const [approverId, setApproverId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (route === "self_decision") {
      setApprovers(null);
      setApproverId("");
      return;
    }
    setApprovers(null);
    setApproverId("");
    apiGet<Approver[]>(`/api/users/approvers?grade=${route}`)
      .then(setApprovers)
      .catch((err) => logError("ProjectDocuments", "결재권자 목록 조회 실패", err));
  }, [route]);

  function handleConfirm() {
    setError(null);
    if (route === "self_decision") {
      onConfirm(route, null);
      return;
    }
    if (!approverId) {
      setError("결재권자를 선택해주세요.");
      return;
    }
    onConfirm(route, Number(approverId));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-sm font-semibold mb-1">결재권자 선택</h3>
        <p className="text-xs text-text-muted mb-4">결재 승인 후에만 저장/발송/출력이 가능합니다.</p>

        <div className="space-y-2 mb-4">
          {ROUTES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="approval_route" checked={route === r} onChange={() => setRoute(r)} />
              {APPROVAL_ROUTE_LABELS[r]}
            </label>
          ))}
        </div>

        {route !== "self_decision" && (
          <div className="mb-4">
            <label className="block text-xs text-text-muted mb-1.5">결재권자 선택</label>
            {approvers === null && <p className="text-xs text-text-muted">불러오는 중...</p>}
            {approvers !== null && approvers.length === 0 && (
              <p className="text-xs text-danger">해당 직급의 직원이 없습니다.</p>
            )}
            {approvers !== null && approvers.length > 0 && (
              <select
                value={approverId}
                onChange={(e) => setApproverId(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              >
                <option value="" disabled>
                  선택
                </option>
                {approvers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {error && <p className="text-xs text-danger mb-3">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? "요청 중..." : "결재 요청"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
