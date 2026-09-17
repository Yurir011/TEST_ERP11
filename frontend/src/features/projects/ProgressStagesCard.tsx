import { Check, ListChecks, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { MAX_PROGRESS_STAGES, type ProgressStage } from "./types";

export function ProgressStagesCard({ projectId }: { projectId: number }) {
  const [stages, setStages] = useState<ProgressStage[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadStages() {
    apiGet<ProgressStage[]>(`/api/projects/${projectId}/progress-stages`)
      .then(setStages)
      .catch((err) => logError("ProjectProgress", "진행 상황 목록 조회 실패", err));
  }

  useEffect(() => {
    loadStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    logDebug("ProjectProgress", `진행 상황 단계 추가 시도: ${name}`);
    try {
      await apiPost(`/api/projects/${projectId}/progress-stages`, { name: name.trim() });
      setName("");
      loadStages();
    } catch (err) {
      logError("ProjectProgress", "진행 상황 단계 추가 실패", err);
      setError(err instanceof Error ? err.message : "추가 중 오류가 발생했습니다.");
    }
  }

  async function handleToggle(stage: ProgressStage) {
    logDebug("ProjectProgress", `진행 상황 단계 토글: id=${stage.id}`);
    try {
      await apiPut(`/api/projects/${projectId}/progress-stages/${stage.id}/toggle`);
      loadStages();
    } catch (err) {
      logError("ProjectProgress", "진행 상황 단계 토글 실패", err);
    }
  }

  async function handleDelete(stage: ProgressStage) {
    if (!window.confirm(`"${stage.name}" 항목을 삭제하시겠습니까?`)) return;
    logDebug("ProjectProgress", `진행 상황 단계 삭제 시도: id=${stage.id}`);
    try {
      await apiDelete(`/api/projects/${projectId}/progress-stages/${stage.id}`);
      loadStages();
    } catch (err) {
      logError("ProjectProgress", "진행 상황 단계 삭제 실패", err);
    }
  }

  const count = stages?.length ?? 0;
  const atMax = count >= MAX_PROGRESS_STAGES;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold">진행 상황</h2>
          <p className="text-xs text-text-muted mt-0.5">항목을 등록하고 완료되면 체크하세요. (최대 {MAX_PROGRESS_STAGES}개)</p>
        </div>
      </div>

      {stages === null && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {stages !== null && stages.length === 0 && (
        <div className="bg-bg border border-dashed border-border rounded-xl p-6 text-center mb-4">
          <ListChecks className="mx-auto mb-2 text-text-muted" size={20} />
          <p className="text-xs text-text-muted">등록된 진행 단계가 없습니다.</p>
        </div>
      )}

      {stages !== null && stages.length > 0 && (
        <div className="flex items-start mb-5 px-8">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 group/stage">
                <button
                  onClick={() => handleToggle(stage)}
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-medium shrink-0 transition-colors ${
                    stage.is_done
                      ? "bg-success border-success text-white"
                      : "border-border bg-bg text-text-muted hover:border-primary/50"
                  }`}
                  title={stage.is_done ? "완료 취소" : "완료 체크"}
                >
                  {stage.is_done ? <Check size={16} /> : i + 1}
                </button>
                <div className="flex items-center gap-1 max-w-[120px]">
                  <span
                    className={`text-xs text-center break-words ${
                      stage.is_done ? "text-text" : "text-text-muted"
                    }`}
                  >
                    {stage.name}
                  </span>
                  <button
                    onClick={() => handleDelete(stage)}
                    className="opacity-0 group-hover/stage:opacity-100 text-text-muted hover:text-danger shrink-0"
                    title="삭제"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 mb-6 ${stage.is_done ? "bg-success/40" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={atMax}
          maxLength={50}
          placeholder={atMax ? `최대 ${MAX_PROGRESS_STAGES}개까지 추가할 수 있습니다` : "진행 단계 이름 입력"}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={atMax || !name.trim()}
          className="flex items-center gap-1 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Plus size={14} />
          추가 ({count}/{MAX_PROGRESS_STAGES})
        </button>
      </form>

      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
