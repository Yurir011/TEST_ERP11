import { Check, Pencil } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { apiGet, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { PurchaseStep } from "./types";

export function PurchaseProgressCard({ projectId }: { projectId: number }) {
  const [steps, setSteps] = useState<PurchaseStep[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const cancelingEditRef = useRef(false);

  function loadSteps() {
    apiGet<PurchaseStep[]>(`/api/projects/${projectId}/purchase-steps`)
      .then(setSteps)
      .catch((err) => logError("ProjectProgress", "구매 진행 목록 조회 실패", err));
  }

  useEffect(() => {
    loadSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleToggle(step: PurchaseStep) {
    logDebug("ProjectProgress", `구매 진행 단계 토글: id=${step.id}`);
    try {
      await apiPut(`/api/projects/${projectId}/purchase-steps/${step.id}/toggle`);
      loadSteps();
    } catch (err) {
      logError("ProjectProgress", "구매 진행 단계 토글 실패", err);
    }
  }

  function startEdit(step: PurchaseStep) {
    cancelingEditRef.current = false;
    setEditingId(step.id);
    setEditValue(step.label);
  }

  async function commitEdit(step: PurchaseStep) {
    if (cancelingEditRef.current) {
      cancelingEditRef.current = false;
      return;
    }
    const name = editValue.trim();
    if (!name || name === step.label) {
      setEditingId(null);
      return;
    }
    logDebug("ProjectProgress", `구매 진행 단계 이름 변경 시도: id=${step.id}, label=${name}`);
    try {
      await apiPut(`/api/projects/${projectId}/purchase-steps/${step.id}/rename`, { label: name });
      setEditingId(null);
      loadSteps();
    } catch (err) {
      logError("ProjectProgress", "구매 진행 단계 이름 변경 실패", err);
    }
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      cancelingEditRef.current = true;
      setEditingId(null);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">구매 진행</h2>
        <p className="text-xs text-text-muted mt-0.5">단계가 완료되면 체크하세요. 이름은 연필 아이콘으로 수정할 수 있습니다.</p>
      </div>

      {steps === null && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {steps !== null && (
        <div className="flex items-start px-8">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 group/step">
                <button
                  onClick={() => handleToggle(step)}
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-medium shrink-0 transition-colors ${
                    step.is_done
                      ? "bg-success border-success text-white"
                      : "border-border bg-bg text-text-muted hover:border-primary/50"
                  }`}
                  title={step.is_done ? "완료 취소" : "완료 체크"}
                >
                  {step.is_done ? <Check size={16} /> : i + 1}
                </button>

                {editingId === step.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEdit(step)}
                    onKeyDown={handleEditKeyDown}
                    maxLength={50}
                    className="w-20 text-xs text-center rounded border border-primary px-1 py-0.5 outline-none bg-bg"
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    <span className={`text-xs text-center ${step.is_done ? "text-text" : "text-text-muted"}`}>
                      {step.label}
                    </span>
                    <button
                      onClick={() => startEdit(step)}
                      className="opacity-0 group-hover/step:opacity-100 text-text-muted hover:text-primary shrink-0"
                      title="이름 수정"
                    >
                      <Pencil size={10} />
                    </button>
                  </div>
                )}

                {step.completed_on && <span className="text-[10px] text-text-muted">{step.completed_on}</span>}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 mb-6 ${step.is_done ? "bg-success/40" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
