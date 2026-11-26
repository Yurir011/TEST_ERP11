import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { isAdminRole } from "../../lib/auth";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, downloadFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { DateNotesCard } from "./DateNotesCard";
import { ProgressSectionCard } from "./ProgressSectionCard";
import { ProjectBomCard } from "./ProjectBomCard";
import { ProjectRoundTabs } from "./ProjectRoundTabs";
import { ProjectPurchaseList } from "./ProjectPurchaseList";
import { ScheduleProgressCard } from "./ScheduleProgressCard";
import { DocColumn } from "./DocColumn";
import { groupBySet } from "./salesDocGroups";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_STYLES,
  SALES_DOC_LABELS,
  type Project,
  type ProgressStage,
  type ProjectStatus,
  type SalesDocument,
} from "./types";

const STATUS_OPTIONS: ProjectStatus[] = ["estimate", "in_progress", "completed", "discarded"];

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [showDiscardForm, setShowDiscardForm] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [documents, setDocuments] = useState<SalesDocument[] | null>(null);
  const [stages, setStages] = useState<ProgressStage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isAddingTab, setIsAddingTab] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { confirm, notify } = useDialog();
  const [statusError, setStatusError] = useState<string | null>(null);
  const { user } = useAuth();
  const [isDeletingRound, setIsDeletingRound] = useState(false);

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
    // 회차 탭으로 다른 프로젝트로 넘어갈 때 이전 프로젝트의 항목·진행율이 남아 새 프로젝트에 섞이지 않게 비운다.
    setProject(null);
    setStages([]);
    setDocuments(null);
    setError(null);
    loadProject();
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleStatusChange(status: ProjectStatus, reason?: string) {
    logDebug("ProjectDetail", `상태 변경 시도: project_id=${id}, status=${status}`);
    try {
      const updated = await apiPut<Project>(`/api/projects/${id}/status`, { status, reason: reason ?? null });
      setProject(updated);
      setShowDiscardForm(false);
      setStatusError(null);
      if (status === "discarded") notify("폐기 처리했습니다. 폐기한 프로젝트는 [회차 삭제]로 지울 수 있습니다.");
    } catch (err) {
      logError("ProjectDetail", "상태 변경 실패", err);
      setStatusError(err instanceof ApiError ? err.message : "상태를 바꾸지 못했습니다.");
    }
  }

  function startRename() {
    setNameDraft(project?.name ?? "");
    setNameError(null);
    setIsRenaming(true);
  }

  async function handleRename() {
    const name = nameDraft.trim();
    if (!name) {
      setNameError("프로젝트 이름을 입력해주세요.");
      return;
    }
    if (name === project?.name) {
      setIsRenaming(false);
      return;
    }
    logDebug("ProjectDetail", `이름 변경 시도: project_id=${id}, name=${name}`);
    setIsSavingName(true);
    try {
      const updated = await apiPut<Project>(`/api/projects/${id}/name`, { name });
      setProject(updated);
      setIsRenaming(false);
      logDebug("ProjectDetail", `이름 변경 성공: project_id=${id}`);
    } catch (err) {
      logError("ProjectDetail", "이름 변경 실패", err);
      setNameError(err instanceof ApiError ? err.message : "이름 변경 중 오류가 발생했습니다.");
    } finally {
      setIsSavingName(false);
    }
  }

  function handleStatusButton(s: ProjectStatus) {
    if (s === "discarded") {
      // 폐기는 사유를 입력받는 칸을 먼저 열고, "폐기 처리"를 눌러야 적용한다.
      setDiscardReason(project?.discard_reason ?? "");
      setShowDiscardForm((v) => !v);
      return;
    }
    handleStatusChange(s);
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

  // 지금 프로젝트와 같은 내용(거래처·메모·일정·진행상황)의 프로젝트를 만들어 같은 묶음의 새 탭으로 남긴다. BOM·문서·구매 내역은 복사하지 않는다.
  async function handleAddTab() {
    if (!project) return;
    setTabError(null);
    if (!(await confirm("같은 내용으로 새 탭(프로젝트)을 추가할까요? 거래처·메모·일정·진행상황(진행률 포함)이 지금 보고 있는 회차 그대로 복사됩니다.", { okLabel: "탭 추가" }))) return;
    setIsAddingTab(true);
    logDebug("ProjectDetail", `탭 추가 시도: from_project_id=${project.id}`);
    try {
      const created = await apiPost<Project>("/api/projects", {
        name: project.name,
        client_id: project.client_id,
        client_name: null,
        memo: project.memo,
        start_date: project.start_date,
        end_date: project.end_date,
        from_project_id: project.id,
        copy_stages: true,
        copy_bom: false,
        link_series: true,
        copy_progress: true,
      });
      logDebug("ProjectDetail", `탭 추가 완료: new_id=${created.id}, series_id=${created.series_id}`);
      navigate(`/projects/${created.id}`);
    } catch (err) {
      logError("ProjectDetail", "탭 추가 실패", err);
      setTabError(err instanceof ApiError ? err.message : "탭을 추가하지 못했습니다.");
    } finally {
      setIsAddingTab(false);
    }
  }

  // 이 회차(프로젝트) 삭제: 폐기한 프로젝트만, 관리자만 (서버도 같은 규칙). 지운 뒤에는 같은 묶음의 다른 회차로, 없으면 목록으로 간다.
  async function handleDeleteRound() {
    if (!project) return;
    setTabError(null);
    const label = project.round_no !== null ? `${project.round_no}회차` : "이 프로젝트";
    if (!(await confirm(`폐기한 ${label} "${project.name}"을(를) 완전히 삭제할까요?
올려 둔 거버·BOM 등 파일도 함께 지워지며 되돌릴 수 없습니다.`, { okLabel: "삭제", danger: true }))) return;
    setIsDeletingRound(true);
    logDebug("ProjectDetail", `회차 삭제 시도: project_id=${project.id}, series_id=${project.series_id}`);
    try {
      let nextId: number | null = null;
      if (project.series_id !== null) {
        const rounds = await apiGet<Project[]>(`/api/projects/${project.id}/rounds`);
        nextId = rounds.filter((r) => r.id !== project.id).at(-1)?.id ?? null;
      }
      await apiDelete(`/api/projects/${project.id}`);
      logDebug("ProjectDetail", `회차 삭제 완료: project_id=${project.id}, next=${nextId}`);
      navigate(nextId !== null ? `/projects/${nextId}` : "/projects", { replace: true });
    } catch (err) {
      logError("ProjectDetail", "회차 삭제 실패", err);
      setTabError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    } finally {
      setIsDeletingRound(false);
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
          <div className={`bg-surface border border-border rounded-2xl p-6 ${project.series_id === null ? "mb-6" : "mb-4"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {isRenaming ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRename();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      id="project-name-input"
                      aria-label="프로젝트 이름"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      maxLength={200}
                      autoFocus
                      className="flex-1 min-w-0 rounded-lg border border-border px-3 py-1.5 text-xl font-semibold outline-none focus:border-primary bg-bg"
                    />
                    <button
                      type="submit"
                      disabled={isSavingName}
                      className="text-sm font-medium bg-primary hover:bg-primary-hover disabled:opacity-60 text-white rounded-lg px-4 py-2 transition-colors shrink-0"
                    >
                      {isSavingName ? "저장 중..." : "저장"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRenaming(false)}
                      className="text-sm text-text-muted hover:text-text px-2 py-2 shrink-0"
                    >
                      취소
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-xl font-semibold break-words min-w-0">{project.name}</h1>
                    <button
                      type="button"
                      onClick={startRename}
                      aria-label="프로젝트 이름 변경"
                      title="이름 변경"
                      className="p-1.5 rounded-lg text-text-faint hover:text-text hover:bg-bg shrink-0"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                )}
                {nameError && <p className="text-xs text-danger mt-1">{nameError}</p>}
                <p className="text-sm text-text-muted mt-1">거래처: {project.client_name}</p>
                {project.memo && <p className="text-sm text-text-muted mt-2">{project.memo}</p>}
                {project.status === "discarded" && (
                  <p className="text-sm text-text-muted mt-2">폐기 사유: {project.discard_reason || "입력된 사유 없음"}</p>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusButton(s)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-opacity ${
                      PROJECT_STATUS_STYLES[s]
                    } ${project.status === s ? "" : "opacity-40 hover:opacity-70"}`}
                  >
                    {PROJECT_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            {showDiscardForm && (
              <div className="mt-4 pt-4 border-t border-border flex items-center gap-2" role="group" aria-label="폐기 사유">
                <input
                  autoFocus
                  aria-label="폐기 사유"
                  value={discardReason}
                  onChange={(e) => setDiscardReason(e.target.value)}
                  placeholder="폐기 사유 (선택) 예: 가격 불일치, 고객 취소, 경쟁사 선정"
                  className="flex-1 min-w-0 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
                />
                <button
                  onClick={() => handleStatusChange("discarded", discardReason)}
                  className="text-sm font-medium bg-primary hover:bg-primary-hover text-white rounded-lg px-4 py-2 transition-colors shrink-0"
                >
                  폐기 처리
                </button>
                <button onClick={() => setShowDiscardForm(false)} className="text-sm text-text-muted hover:text-text px-2 py-2 shrink-0">
                  취소
                </button>
              </div>
            )}
            {statusError && <p className="text-xs text-danger mt-2">{statusError}</p>}
            <div className="flex justify-end gap-2 mt-3 -mr-2">
              {project.status === "discarded" && isAdminRole(user?.role) && (
                <button
                  type="button"
                  onClick={handleDeleteRound}
                  disabled={isDeletingRound}
                  className="inline-flex h-11 w-28 items-center justify-center gap-2 px-2 text-center text-sm font-medium rounded-lg border border-danger text-danger hover:bg-danger hover:text-white transition-colors disabled:opacity-60"
                >
                  <Trash2 size={16} aria-hidden />
                  {isDeletingRound ? "삭제 중..." : "회차 삭제"}
                </button>
              )}
              <button
                type="button"
                onClick={handleAddTab}
                disabled={isAddingTab}
                className="inline-flex h-11 w-28 items-center justify-center gap-2 px-2 text-center text-sm font-medium text-white rounded-lg bg-primary hover:bg-primary-hover transition-colors disabled:opacity-60"
              >
                <Plus size={16} aria-hidden />
                {isAddingTab ? "추가 중..." : "탭 추가"}
              </button>
            </div>
            {tabError && <p className="text-xs text-danger mt-2 text-right">{tabError}</p>}
          </div>

          <ProjectRoundTabs project={project} />

          <ProjectBomCard key={project.id} projectId={project.id} />

          <ScheduleProgressCard key={project.id} project={project} stages={stages} onUpdated={setProject} />

          <ProgressSectionCard key={project.id} project={project} onStagesChange={setStages} />

          <DateNotesCard key={project.id} project={project} />

          <ProjectPurchaseList key={project.id} projectId={project.id} />

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
