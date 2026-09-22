import { useState } from "react";
import { ApproverSelect } from "../../components/approval/ApproverSelect";

export function ApproverPickerModal({
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  isSubmitting: boolean;
  onConfirm: (approverId: number) => void;
  onCancel: () => void;
}) {
  const [approverId, setApproverId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    if (!approverId) {
      setError("결재권자를 선택해주세요.");
      return;
    }
    onConfirm(Number(approverId));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-sm font-semibold mb-1">결재권자 선택</h3>
        <p className="text-xs text-text-muted mb-4">결재 승인 후에만 저장/발송/출력이 가능합니다.</p>

        <div className="mb-4">
          <ApproverSelect value={approverId} onChange={setApproverId} />
        </div>

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
