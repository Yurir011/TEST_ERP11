import { ArrowLeft, Download, FileText, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, downloadFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { PercentPickerPopover } from "./PercentPickerPopover";
import { PROGRESS_ROW_STYLES } from "./progressRowStyles";
import { PurchaseProgressCard } from "./PurchaseProgressCard";
import {
  PROJECT_DOC_STATUS_LABELS,
  PROJECT_DOC_STATUS_STYLES,
  PROJECT_DOC_TYPE_LABELS,
  type ProjectDocument,
} from "../projectDocuments/types";
import {
  MAX_PROGRESS_STAGES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_STYLES,
  SALES_DOC_LABELS,
  type Project,
  type ProgressStage,
  type ProjectStatus,
  type SalesDocument,
} from "./types";

const STATUS_OPTIONS: ProjectStatus[] = ["estimate", "in_progress", "completed"];

// ── 주차 기반 진행 타임라인 계산용 헬퍼 ──
const TIMELINE_LABEL_WIDTH = "6rem";

function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

// 프로젝트 시작일 기준 몇 번째 주차인지 계산 (1주차부터 시작)
function dateToWeek(dateStr: string, projectStart: string): number {
  return Math.floor(diffDays(parseDate(projectStart), parseDate(dateStr)) / 7) + 1;
}

function stageWeekRange(
  stage: ProgressStage,
  projectStart: string,
  totalWeeks: number
): [number, number] | null {
  if (!stage.start_date || !stage.end_date) return null;
  const startWeek = Math.max(1, dateToWeek(stage.start_date, projectStart));
  const endWeek = Math.min(totalWeeks, dateToWeek(stage.end_date, projectStart));
  if (endWeek < startWeek) return null;
  return [startWeek, endWeek];
}

// 오늘이 전체 기간 안에 있을 때만 0~1 사이 위치(비율)를 반환한다.
function todayFraction(projectStart: string, totalWeeks: number): number | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = diffDays(parseDate(projectStart), today);
  const totalDays = totalWeeks * 7;
  if (days < 0 || days > totalDays) return null;
  return days / totalDays;
}

// "진행상황" — 주차 그리드에 정렬된 구간 바(무채색 트랙 + 진행율만큼 컬러 채움). 클릭으로 진행율 기록, 연필로 기간 수정.
function ProgressSectionCard({
  project,
  onStagesChange,
}: {
  project: Project;
  onStagesChange: (stages: ProgressStage[]) => void;
}) {
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
    if (!window.confirm(`"${stage.name}" 항목을 삭제하시겠습니까?`)) return;
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
        항목을 등록하고 기간을 정하면 그 주차만큼만 바가 표시됩니다. 바를 클릭해 진행율을 기록하고, 연필 아이콘으로
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
          {hasSchedule && fraction !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-danger z-20 pointer-events-none"
              style={{ left: `calc(${TIMELINE_LABEL_WIDTH} + (100% - ${TIMELINE_LABEL_WIDTH}) * ${fraction})` }}
            >
              <span className="absolute -top-4 -translate-x-1/2 text-[9px] text-danger font-medium whitespace-nowrap">
                오늘
              </span>
            </div>
          )}

          {hasSchedule && (
            <div className="flex mb-1.5">
              <div style={{ width: TIMELINE_LABEL_WIDTH }} className="shrink-0" />
              <div className="flex-1 grid text-[10px] text-text-muted" style={gridStyle}>
                {weeks.map((w) => (
                  <div key={w} className="text-center">
                    {w}주
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {stages.map((stage, i) => {
              const style = PROGRESS_ROW_STYLES[i % PROGRESS_ROW_STYLES.length];
              const range = hasSchedule ? stageWeekRange(stage, project.start_date!, totalWeeks) : null;
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
                    <div className="flex-1 grid h-8" style={gridStyle}>
                      {range ? (
                        <div className="relative h-full" style={{ gridColumn: `${range[0]} / ${range[1] + 1}` }}>
                          <div
                            onClick={() => setOpenPickerId(stage.id)}
                            className="absolute inset-0 rounded-full bg-bg border border-border overflow-hidden cursor-pointer"
                            title="클릭하여 진행율 기록"
                          >
                            <div
                              className={`absolute inset-y-0 left-0 rounded-full transition-all ${style.bar}`}
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
                      ) : (
                        <div
                          onClick={() => setEditingId(editingId === stage.id ? null : stage.id)}
                          title="클릭하여 기간 수정"
                          style={{ gridColumn: `1 / ${totalWeeks + 1}` }}
                          className="flex items-center cursor-pointer"
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

// 종합 진행률 옆에 붙일 주차 요약: "3주차 / 총 8주". 일정이 없으면 null, 기간 밖이면 시작 전/종료로 표시한다.
function weekSummary(project: Project): string | null {
  if (!project.start_date || !project.end_date) return null;
  const totalWeeks = Math.max(1, Math.ceil((diffDays(parseDate(project.start_date), parseDate(project.end_date)) + 1) / 7));
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (todayStr < project.start_date) return `시작 전 / 총 ${totalWeeks}주`;
  if (todayStr > project.end_date) return `종료 / 총 ${totalWeeks}주`;
  return `${dateToWeek(todayStr, project.start_date)}주차 / 총 ${totalWeeks}주`;
}

// 진행상황 항목들의 진행율 평균을 종합 진행률로 계산한다.
function calcStageProgress(stages: ProgressStage[]): number | null {
  if (stages.length === 0) return null;
  const sum = stages.reduce((acc, s) => acc + s.progress_percent, 0);
  return Math.round(sum / stages.length);
}

function ScheduleProgressCard({
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

interface DocSetGroup {
  setId: number;
  estimate?: SalesDocument;
  statement?: SalesDocument;
}

function groupBySet(documents: SalesDocument[]): DocSetGroup[] {
  const map = new Map<number, DocSetGroup>();
  for (const doc of documents) {
    const group = map.get(doc.set_id) ?? { setId: doc.set_id };
    if (doc.doc_type === "estimate") group.estimate = doc;
    else group.statement = doc;
    map.set(doc.set_id, group);
  }
  return Array.from(map.values()).sort((a, b) => b.setId - a.setId);
}

function DocColumn({
  doc,
  label,
  onDownload,
  isDownloading,
}: {
  doc?: SalesDocument;
  label: string;
  onDownload: (doc: SalesDocument) => void;
  isDownloading: boolean;
}) {
  if (!doc) {
    return (
      <div className="flex-1 px-5 py-4 text-sm text-text-muted">
        {label} 없음
      </div>
    );
  }
  return (
    <div className="flex-1 px-5 py-4">
      <p className="text-sm font-medium">
        {label} · {doc.doc_no}
      </p>
      <p className="text-xs text-text-muted mt-1">합계 {formatCurrency(doc.total)}</p>
      <button
        onClick={() => onDownload(doc)}
        disabled={isDownloading}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 disabled:opacity-50 mt-3"
      >
        <Download size={14} />
        {isDownloading ? "다운로드 중..." : "다운로드"}
      </button>
    </div>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<SalesDocument[] | null>(null);
  const [projectDocs, setProjectDocs] = useState<ProjectDocument[] | null>(null);
  const [stages, setStages] = useState<ProgressStage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  function loadProject() {
    apiGet<Project>(`/api/projects/${id}`)
      .then(setProject)
      .catch((err) => {
        logError("ProjectDetail", "조회 실패", err);
        setError("프로젝트를 찾을 수 없습니다.");
      });
  }

  // 견적서·거래명세서는 전자결재(문서관리)와 같은 문서로 작성/결재/PDF 발급되므로 그쪽 목록을 그대로 가져온다.
  function loadProjectDocs() {
    apiGet<ProjectDocument[]>(`/api/project-documents?project_id=${id}`)
      .then((list) => setProjectDocs(list.filter((d) => d.doc_type !== "tax_invoice")))
      .catch((err) => logError("ProjectDetail", "견적서·거래명세서 목록 조회 실패", err));
  }

  function loadDocuments() {
    apiGet<SalesDocument[]>(`/api/sales-documents?project_id=${id}`)
      .then(setDocuments)
      .catch((err) => logError("ProjectDetail", "문서 목록 조회 실패", err));
  }

  useEffect(() => {
    loadProject();
    loadDocuments();
    loadProjectDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleStatusChange(status: ProjectStatus) {
    try {
      const updated = await apiPut<Project>(`/api/projects/${id}/status`, { status });
      setProject(updated);
    } catch (err) {
      logError("ProjectDetail", "상태 변경 실패", err);
    }
  }

  async function handleDownload(doc: SalesDocument) {
    setDownloadingId(doc.id);
    try {
      await downloadFile(`/api/sales-documents/${doc.id}/download`, `${SALES_DOC_LABELS[doc.doc_type]}_${doc.doc_no}.pdf`);
    } catch (err) {
      logError("ProjectDetail", "다운로드 실패", err);
    } finally {
      setDownloadingId(null);
    }
  }

  const setGroups = documents ? groupBySet(documents) : null;

  return (
    <MainLayout title="프로젝트관리">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-4">
        <ArrowLeft size={16} />
        목록으로
      </Link>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !project && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {project && (
        <>
          <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold">{project.name}</h1>
                <p className="text-sm text-text-muted mt-1">거래처: {project.client_name}</p>
                {project.memo && <p className="text-sm text-text-muted mt-2">{project.memo}</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-opacity ${
                      PROJECT_STATUS_STYLES[s]
                    } ${project.status === s ? "" : "opacity-40 hover:opacity-70"}`}
                  >
                    {PROJECT_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ScheduleProgressCard project={project} stages={stages} onUpdated={setProject} />

          <ProgressSectionCard project={project} onStagesChange={setStages} />

          <PurchaseProgressCard projectId={project.id} />

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text-muted">견적서 · 거래명세서</h2>
            <div className="flex items-center gap-2">
              {(["quotation", "statement", "set"] as const).map((type) => (
                <Link
                  key={type}
                  to={`/projects/${project.id}/documents/new?type=${type}`}
                  className="flex items-center gap-1.5 text-xs font-medium bg-primary hover:bg-primary-hover text-white rounded-lg px-3 py-1.5 transition-colors"
                >
                  <Plus size={14} />
                  {type === "set" ? "견적서 + 거래명세서 동시 작성" : `${PROJECT_DOC_TYPE_LABELS[type]} 작성`}
                </Link>
              ))}
            </div>
          </div>

          {projectDocs !== null && projectDocs.length === 0 && (
            <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center mb-6">
              <FileText className="mx-auto mb-2 text-text-muted" size={24} />
              <p className="text-sm text-text-muted">작성된 문서가 없습니다.</p>
            </div>
          )}

          {projectDocs !== null && projectDocs.length > 0 && (
            <div className="bg-surface border border-border rounded-2xl divide-y divide-border mb-6">
              {projectDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <Link to={`/project-documents?open=${doc.id}`} className="min-w-0 flex-1 hover:text-primary transition-colors">
                    <p className="text-sm font-medium truncate">
                      {PROJECT_DOC_TYPE_LABELS[doc.doc_type]}
                      {doc.doc_no ? ` · ${doc.doc_no}` : ""}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      {doc.client_name} · {doc.issue_date}
                    </p>
                  </Link>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${PROJECT_DOC_STATUS_STYLES[doc.status]}`}>
                    {PROJECT_DOC_STATUS_LABELS[doc.status]}
                  </span>
                  {doc.status === "approved" && doc.has_pdf && (
                    <button
                      onClick={async () => {
                        try {
                          await downloadFile(`/api/project-documents/${doc.id}/pdf`, `${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}_${doc.issue_date}.pdf`);
                        } catch (err) {
                          logError("ProjectDetail", "문서 PDF 다운로드 실패", err);
                        }
                      }}
                      className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 shrink-0"
                    >
                      <Download size={14} />
                      PDF
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {setGroups !== null && setGroups.length > 0 && (
            <h3 className="text-xs font-medium text-text-muted mb-2">이전 방식으로 작성한 문서</h3>
          )}
          {setGroups !== null && setGroups.length > 0 && (
            <div className="space-y-3">
              {setGroups.map((group) => (
                <div key={group.setId} className="bg-surface border border-border rounded-2xl overflow-hidden">
                  <p className="text-xs text-text-muted px-5 pt-4">
                    세트 #{String(group.setId).padStart(6, "0")} · {(group.estimate ?? group.statement)!.issue_date}
                  </p>
                  <div className="flex divide-x divide-border mt-2">
                    <DocColumn
                      doc={group.estimate}
                      label={SALES_DOC_LABELS.estimate}
                      onDownload={handleDownload}
                      isDownloading={downloadingId === group.estimate?.id}
                    />
                    <DocColumn
                      doc={group.statement}
                      label={SALES_DOC_LABELS.statement}
                      onDownload={handleDownload}
                      isDownloading={downloadingId === group.statement?.id}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </MainLayout>
  );
}
