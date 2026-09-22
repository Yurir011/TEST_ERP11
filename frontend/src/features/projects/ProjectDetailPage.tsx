import { ArrowLeft, Download, FileText, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet, apiPut, downloadFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { PercentPickerPopover } from "./PercentPickerPopover";
import { ProgressStagesCard } from "./ProgressStagesCard";
import { PurchaseProgressCard } from "./PurchaseProgressCard";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_STYLES,
  SALES_DOC_LABELS,
  type Project,
  type ProgressStage,
  type ProjectStatus,
  type SalesDocument,
} from "./types";

const STATUS_OPTIONS: ProjectStatus[] = ["estimate", "in_progress", "completed"];

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
          <span className="text-xs font-bold text-[#16A34A] tabular-nums">{project.progress_percent}%</span>
        </div>
        <div className="relative">
          <div
            onClick={() => setPickerOpen(true)}
            title="클릭하여 진행율을 선택합니다 (진행상황 항목 비율로 자동 계산되기도 합니다)"
            className="h-6 rounded-lg bg-bg overflow-hidden cursor-pointer"
          >
            <div
              className="h-full rounded-lg transition-all duration-300"
              style={{
                width: `${project.progress_percent}%`,
                background: "linear-gradient(90deg, #BCEFCB, #16A34A)",
              }}
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

  function loadDocuments() {
    apiGet<SalesDocument[]>(`/api/sales-documents?project_id=${id}`)
      .then(setDocuments)
      .catch((err) => logError("ProjectDetail", "문서 목록 조회 실패", err));
  }

  useEffect(() => {
    loadProject();
    loadDocuments();
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

          <ProgressStagesCard projectId={project.id} onStagesChange={setStages} />
          <PurchaseProgressCard projectId={project.id} />

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text-muted">견적서 · 거래명세서</h2>
            <Link
              to={`/projects/${project.id}/documents/new`}
              className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-surface"
            >
              <Plus size={14} />
              견적서 · 거래명세서 작성
            </Link>
          </div>

          {setGroups !== null && setGroups.length === 0 && (
            <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
              <FileText className="mx-auto mb-2 text-text-muted" size={24} />
              <p className="text-sm text-text-muted">작성된 문서가 없습니다.</p>
            </div>
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
