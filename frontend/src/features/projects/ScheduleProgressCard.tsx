import { useEffect, useRef, useState } from "react";
import { ApiError, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { PercentPickerPopover } from "./PercentPickerPopover";
import type { Project, ProgressStage } from "./types";
import { calcStageProgress, weekSummary } from "./timeline";

export function ScheduleProgressCard({
  project,
  stages,
  onUpdated,
}: {
  project: Project;
  stages: ProgressStage[];
  onUpdated: (p: Project) => void;
}) {
  const [startDate, setStartDate] = useState(project.start_date ?? "");
  const [endDate, setEndDate] = useState(project.end_date ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastSyncedStageProgress = useRef<number | null>(null);

  async function handleSaveSchedule() {
    setError(null);
    if (startDate && endDate && startDate > endDate) {
      setError("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }
    setIsSaving(true);
    try {
      const updated = await apiPut<Project>(`/api/projects/${project.id}/schedule`, {
        start_date: startDate || null,
        end_date: endDate || null,
      });
      onUpdated(updated);
    } catch (err) {
      logError("ProjectDetail", "일정 저장 실패", err);
      setError(err instanceof ApiError ? err.message : "일정 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleProgressChange(value: number) {
    logDebug("ProjectDetail", `진행율 변경 시도: project_id=${project.id}, value=${value}`);
    try {
      const updated = await apiPut<Project>(`/api/projects/${project.id}/progress`, { progress_percent: value });
      onUpdated(updated);
    } catch (err) {
      logError("ProjectDetail", "진행율 변경 실패", err);
    }
  }

  // 진행상황 항목 체크 결과가 바뀌면 종합 진행률을 자동으로 계산해 반영한다.
  useEffect(() => {
    const stageProgress = calcStageProgress(stages);
    if (stageProgress === null) return;
    if (lastSyncedStageProgress.current === stageProgress) return;
    lastSyncedStageProgress.current = stageProgress;
    if (project.progress_percent !== stageProgress) {
      handleProgressChange(stageProgress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages]);

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      <h2 className="text-sm font-medium text-text-muted mb-3">일정 · 진행율</h2>
      <p className="text-xs text-text-muted mb-3">
        시작일·종료일을 등록하면 대시보드의 '프로젝트 진행 현황' 차트에 표시됩니다.
      </p>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div>
          <label className="block text-xs text-text-muted mb-1.5">시작일</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5">종료일</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <button
        onClick={handleSaveSchedule}
        disabled={isSaving}
        className="mt-3 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-bg disabled:opacity-50"
      >
        {isSaving ? "저장 중..." : "일정 저장"}
      </button>

      <div className="mt-5">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-text-muted">종합 진행률</label>
          <span className="text-xs tabular-nums">
            {weekSummary(project) && <span className="text-text-muted mr-2">{weekSummary(project)}</span>}
            <span className="font-bold text-progress-4-fg">{project.progress_percent}%</span>
          </span>
        </div>
        <div className="relative">
          <div
            onClick={() => setPickerOpen(true)}
            title="클릭하여 진행율을 선택합니다 (진행상황 항목 비율로 자동 계산되기도 합니다)"
            className="h-6 rounded-lg bg-bg overflow-hidden cursor-pointer"
          >
            <div
              className="h-full rounded-lg transition-all duration-300 bg-progress-4-fg"
              style={{ width: `${project.progress_percent}%` }}
            />
          </div>
          {pickerOpen && (
            <PercentPickerPopover
              value={project.progress_percent}
              onSelect={handleProgressChange}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
        <p className="text-[11px] text-text-muted mt-1.5">
          진행상황 항목 체크 비율로 자동 계산되며, 바를 클릭해 직접 조정할 수도 있습니다.
        </p>
      </div>
    </div>
  );
}
