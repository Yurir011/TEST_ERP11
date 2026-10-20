import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { PercentPickerPopover } from "./PercentPickerPopover";
import { PROGRESS_ROW_STYLES } from "./progressRowStyles";
import { MAX_PROGRESS_STAGES, type Project, type ProgressStage } from "./types";
import { TIMELINE_LABEL_WIDTH, diffDays, formatMonthDay, parseDate, stageDayRange, todayFraction } from "./timeline";

// 항목 이름 칸 + 간격 뒤부터 연필·삭제 버튼 앞까지가 날짜 그래프가 그려지는 영역이다 (주 눈금·오늘 선·바가 같은 영역을 기준으로 맞춘다).
const TRACK_LEFT = `calc(${TIMELINE_LABEL_WIDTH} + 0.5rem)`;
const TRACK_RIGHT = "40px";
// 바가 이 비율보다 좁으면 진행율 글자를 오른쪽 정렬 대신 가운데에 둔다
const MIN_INSIDE_LABEL_WIDTH = 0.09;
import { useDialog } from "../../components/ui/dialog/useDialog";

// "진행상황" — 주차 그리드에 정렬된 구간 바(무채색 트랙 + 진행율만큼 컬러 채움). 클릭으로 진행율 기록, 연필로 기간 수정.
export function ProgressSectionCard({
  project,
  onStagesChange,
}: {
  project: Project;
  onStagesChange: (stages: ProgressStage[]) => void;
}) {
  const { confirm } = useDialog();
  const [stages, setStagesState] = useState<ProgressStage[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openPickerId, setOpenPickerId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  function loadStages() {
    apiGet<ProgressStage[]>(`/api/projects/${project.id}/progress-stages`)
      .then((data) => {
        setStagesState(data);
        onStagesChange(data);
      })
      .catch((err) => logError("ProjectProgress", "진행 상황 목록 조회 실패", err));
  }

  useEffect(() => {
    loadStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    logDebug("ProjectProgress", `진행 상황 단계 추가 시도: ${name}`);
    try {
      await apiPost(`/api/projects/${project.id}/progress-stages`, { name: name.trim() });
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
      await apiPut(`/api/projects/${project.id}/progress-stages/${stage.id}/progress`, { progress_percent: value });
      loadStages();
    } catch (err) {
      logError("ProjectProgress", "진행 상황 단계 진행율 변경 실패", err);
    }
  }

  async function handleSetSchedule(stage: ProgressStage, field: "start_date" | "end_date", value: string) {
    const nextValue = value || null;
    logDebug(
      "ProjectProgress",
      `진행 상황 단계 일정 변경 시도: id=${stage.id}, field=${field}, value=${nextValue}`
    );
    try {
      await apiPut(`/api/projects/${project.id}/progress-stages/${stage.id}/schedule`, {
        start_date: field === "start_date" ? nextValue : stage.start_date,
        end_date: field === "end_date" ? nextValue : stage.end_date,
      });
      loadStages();
    } catch (err) {
      logError("ProjectProgress", "진행 상황 단계 일정 변경 실패", err);
      setError(err instanceof Error ? err.message : "일정 변경 중 오류가 발생했습니다.");
    }
  }

  async function handleDelete(stage: ProgressStage) {
    if (!(await confirm(`"${stage.name}" 항목을 삭제하시겠습니까?`, { okLabel: "삭제", danger: true }))) return;
    logDebug("ProjectProgress", `진행 상황 단계 삭제 시도: id=${stage.id}`);
    try {
      await apiDelete(`/api/projects/${project.id}/progress-stages/${stage.id}`);
      loadStages();
    } catch (err) {
      logError("ProjectProgress", "진행 상황 단계 삭제 실패", err);
    }
  }

  const count = stages?.length ?? 0;
  const atMax = count >= MAX_PROGRESS_STAGES;
  const hasSchedule = !!project.start_date && !!project.end_date;
  const totalWeeks = hasSchedule
    ? Math.max(1, Math.ceil((diffDays(parseDate(project.start_date!), parseDate(project.end_date!)) + 1) / 7))
    : 0;
  const weeks = hasSchedule ? Array.from({ length: totalWeeks }, (_, i) => i + 1) : [];
  const fraction = hasSchedule ? todayFraction(project.start_date!, totalWeeks) : null;
  const gridStyle = { gridTemplateColumns: `repeat(${totalWeeks}, minmax(0, 1fr))` };
  const editingStage = stages?.find((s) => s.id === editingId) ?? null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      <h2 className="text-sm font-semibold mb-1">진행상황</h2>
      <p className="text-xs text-text-muted mb-4">
        항목을 등록하고 기간을 정하면 실제 날짜 위치에 맞춰 바가 표시됩니다. 바를 클릭해 진행율을 기록하고, 연필 아이콘으로
        기간을 바꿀 수 있습니다. (최대 {MAX_PROGRESS_STAGES}개)
      </p>

      {!hasSchedule && (
        <p className="text-xs text-text-muted mb-4">
          먼저 아래 '일정 · 진행율'에서 프로젝트 시작일·종료일을 등록하면 주차별 타임라인이 표시됩니다.
        </p>
      )}

      {stages === null && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {stages !== null && stages.length === 0 && (
        <div className="bg-bg border border-dashed border-border rounded-xl p-6 text-center mb-4">
          <ListChecks className="mx-auto mb-2 text-text-muted" size={20} />
          <p className="text-xs text-text-muted">등록된 진행 단계가 없습니다.</p>
        </div>
      )}

      {stages !== null && stages.length > 0 && (
        <div className="relative mb-4">
          {hasSchedule && (
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: TRACK_LEFT, right: TRACK_RIGHT }}>
              {Array.from({ length: totalWeeks + 1 }, (_, i) => (
                <i key={i} className="absolute top-0 bottom-0 w-px bg-border/70" style={{ left: `${(i / totalWeeks) * 100}%` }} />
              ))}
              {fraction !== null && (
                <div className="absolute top-0 bottom-0 w-px bg-danger z-20" style={{ left: `${fraction * 100}%` }}>
                  <span className="absolute -top-4 -translate-x-1/2 text-[9px] text-danger font-medium whitespace-nowrap">
                    오늘
                  </span>
                </div>
              )}
            </div>
          )}

          {hasSchedule && (
            <div className="flex mb-1.5">
              <div style={{ width: TRACK_LEFT }} className="shrink-0" />
              <div className="flex-1 grid text-[10px] text-text-muted" style={gridStyle}>
                {weeks.map((w) => (
                  <div key={w} className="text-center">
                    {w}주
                  </div>
                ))}
              </div>
              <div style={{ width: TRACK_RIGHT }} className="shrink-0" />
            </div>
          )}

          <div className="space-y-2.5">
            {stages.map((stage, i) => {
              const style = PROGRESS_ROW_STYLES[i % PROGRESS_ROW_STYLES.length];
              const range = hasSchedule ? stageDayRange(stage, project.start_date!, totalWeeks) : null;
              return (
                <div key={stage.id} className="flex items-center gap-2 group/stage">
                  <div
                    onClick={() => setEditingId(editingId === stage.id ? null : stage.id)}
                    title="클릭하여 기간 수정"
                    style={{ width: TIMELINE_LABEL_WIDTH }}
                    className="shrink-0 pr-2 text-xs font-medium truncate cursor-pointer hover:text-primary"
                  >
                    {stage.name}
                  </div>

                  {hasSchedule ? (
                    <div className="flex-1 relative h-8">
                      {range ? (
                        <>
                          <div
                            className="absolute inset-y-0"
                            style={{ left: `${range.left * 100}%`, width: `${range.width * 100}%`, minWidth: 14 }}
                          >
                            <div
                              onClick={() => setOpenPickerId(stage.id)}
                              className="absolute inset-0 rounded-full bg-bg border border-border overflow-hidden cursor-pointer"
                              title="클릭하여 진행율 기록"
                            >
                              <div
                                className={`absolute inset-y-0 left-0 rounded-full transition-all ${style.bar}`}
                                style={{ width: `${stage.progress_percent}%` }}
                              />
                            </div>
                            {/* 진행율은 바 안쪽에만 적는다. 바가 좁으면 가운데에 두어 글자가 바 밖으로 조금 넘쳐도 읽히게 한다 */}
                            <span
                              className={`absolute inset-0 flex items-center text-[10px] font-semibold text-text whitespace-nowrap pointer-events-none ${
                                range.width > MIN_INSIDE_LABEL_WIDTH ? "justify-end pr-2" : "justify-center"
                              }`}
                            >
                              {stage.progress_percent}%
                            </span>
                            {openPickerId === stage.id && (
                              <PercentPickerPopover
                                value={stage.progress_percent}
                                onSelect={(v) => handleSetProgress(stage, v)}
                                onClose={() => setOpenPickerId(null)}
                              />
                            )}
                          </div>
                          {/* 정확한 날짜를 바로 읽을 수 있게 기간과 일수를 바 옆에 적는다 (오른쪽 끝에 가까우면 왼쪽에) */}
                          <span
                            className="absolute top-1/2 -translate-y-1/2 text-[11px] text-text-muted whitespace-nowrap tabular-nums pointer-events-none"
                            style={
                              range.left + range.width > 0.62
                                ? { right: `${(1 - range.left) * 100}%`, marginRight: 6 }
                                : { left: `${(range.left + range.width) * 100}%`, marginLeft: 6 }
                            }
                          >
                            {formatMonthDay(stage.start_date!)} ~ {formatMonthDay(stage.end_date!)} ({range.days}일)
                          </span>
                        </>
                      ) : (
                        <div
                          onClick={() => setEditingId(editingId === stage.id ? null : stage.id)}
                          title="클릭하여 기간 수정"
                          className="absolute inset-0 flex items-center cursor-pointer"
                        >
                          <span className="text-[11px] text-text-muted hover:text-primary">기간을 설정해주세요</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 relative h-6">
                      <div
                        onClick={() => setOpenPickerId(stage.id)}
                        className="absolute inset-0 rounded-lg bg-bg border border-border overflow-hidden cursor-pointer"
                        title="클릭하여 진행율 기록"
                      >
                        <div
                          className={`absolute inset-y-0 left-0 rounded-lg transition-all ${style.bar}`}
                          style={{ width: `${stage.progress_percent}%` }}
                        />
                        <span className="relative z-10 h-full flex items-center justify-end pr-2 text-[10px] font-semibold text-text">
                          {stage.progress_percent}%
                        </span>
                      </div>
                      {openPickerId === stage.id && (
                        <PercentPickerPopover
                          value={stage.progress_percent}
                          onSelect={(v) => handleSetProgress(stage, v)}
                          onClose={() => setOpenPickerId(null)}
                        />
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => setEditingId(editingId === stage.id ? null : stage.id)}
                    className="shrink-0 text-text-muted hover:text-primary"
                    title="기간 수정"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(stage)}
                    className="shrink-0 text-text-muted hover:text-danger opacity-0 group-hover/stage:opacity-100"
                    title="삭제"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {editingStage && (
            <div className="mt-3 flex items-center gap-2 text-xs bg-bg border border-border rounded-lg px-3 py-2">
              <span className="text-text-muted shrink-0">{editingStage.name} 기간</span>
              <input
                type="date"
                value={editingStage.start_date ?? ""}
                onChange={(e) => handleSetSchedule(editingStage, "start_date", e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="border border-border rounded-md px-1.5 py-1 bg-surface outline-none focus:border-primary cursor-pointer"
              />
              <span className="text-text-muted">~</span>
              <input
                type="date"
                value={editingStage.end_date ?? ""}
                onChange={(e) => handleSetSchedule(editingStage, "end_date", e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="border border-border rounded-md px-1.5 py-1 bg-surface outline-none focus:border-primary cursor-pointer"
              />
              <button onClick={() => setEditingId(null)} className="ml-auto text-text-muted hover:text-text">
                닫기
              </button>
            </div>
          )}
        </div>
      )}

      {showAddForm ? (
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            autoFocus
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
          <button
            type="button"
            onClick={() => setShowAddForm(false)}
            className="text-xs text-text-muted hover:text-text shrink-0 px-1"
            title="닫기"
          >
            취소
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          disabled={atMax}
          className="flex items-center gap-1 text-xs border border-dashed border-border rounded-lg px-3 py-2 text-text-muted hover:bg-bg hover:text-text disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={14} />
          항목 추가 ({count}/{MAX_PROGRESS_STAGES})
        </button>
      )}

      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
