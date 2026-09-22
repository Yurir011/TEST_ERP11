import { Check, ListChecks, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { PercentPickerPopover } from "./PercentPickerPopover";
import { PROGRESS_ROW_STYLES } from "./progressRowStyles";
import { MAX_PROGRESS_STAGES, type ProgressStage } from "./types";

interface ProgressStagesCardProps {
  projectId: number;
  onStagesChange?: (stages: ProgressStage[]) => void;
}

export function ProgressStagesCard({ projectId, onStagesChange }: ProgressStagesCardProps) {
  const [stages, setStages] = useState<ProgressStage[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openPickerId, setOpenPickerId] = useState<number | null>(null);

  function loadStages() {
    apiGet<ProgressStage[]>(`/api/projects/${projectId}/progress-stages`)
      .then((data) => {
        setStages(data);
        onStagesChange?.(data);
      })
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

  async function handleSetProgress(stage: ProgressStage, value: number) {
    logDebug("ProjectProgress", `진행 상황 단계 진행율 변경 시도: id=${stage.id}, value=${value}`);
    try {
      await apiPut(`/api/projects/${projectId}/progress-stages/${stage.id}/progress`, { progress_percent: value });
      loadStages();
    } catch (err) {
      logError("ProjectProgress", "진행 상황 단계 진행율 변경 실패", err);
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
        <div className="space-y-4 mb-5">
          {stages.map((stage, i) => {
            const style = PROGRESS_ROW_STYLES[i % PROGRESS_ROW_STYLES.length];
            const done = stage.progress_percent === 100;
            return (
              <div key={stage.id} className="flex items-center gap-3 group/stage">
                <button
                  onClick={() => handleSetProgress(stage, done ? 0 : 100)}
                  title={done ? "클릭하여 0%로 초기화" : "클릭하여 100% 완료 처리"}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-medium shrink-0 transition-colors ${
                    done
                      ? `${style.dot} border-transparent text-white`
                      : "border-border bg-bg text-text-muted hover:border-primary/50"
                  }`}
                >
                  {done ? <Check size={14} /> : i + 1}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-xs truncate ${done ? "text-text" : "text-text-muted"}`}>
                      {stage.name}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-medium text-text-muted tabular-nums">
                        {stage.progress_percent}%
                      </span>
                      <button
                        onClick={() => handleDelete(stage)}
                        className="opacity-0 group-hover/stage:opacity-100 text-text-muted hover:text-danger"
                        title="삭제"
                      >
                        <Trash2 size={11} />
                      </button>
                    </span>
                  </div>
                  <div className="relative">
                    <div
                      onClick={() => setOpenPickerId(stage.id)}
                      title="클릭하여 진행율을 선택합니다"
                      className="h-6 rounded-lg bg-bg overflow-hidden cursor-pointer"
                    >
                      <div
                        className={`h-full rounded-lg transition-all duration-300 ${
                          stage.progress_percent > 0 ? style.bar : ""
                        }`}
                        style={{ width: `${stage.progress_percent}%` }}
                      />
                    </div>
                    {openPickerId === stage.id && (
                      <PercentPickerPopover
                        value={stage.progress_percent}
                        onSelect={(v) => handleSetProgress(stage, v)}
                        onClose={() => setOpenPickerId(null)}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
