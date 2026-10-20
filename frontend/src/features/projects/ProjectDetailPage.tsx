import { ArrowLeft, Download, FileText, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { apiGet, apiPut, downloadFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { DateNotesCard } from "./DateNotesCard";
import { PurchaseProgressCard } from "./PurchaseProgressCard";
import { ProgressSectionCard } from "./ProgressSectionCard";
import { ScheduleProgressCard } from "./ScheduleProgressCard";
import { DocColumn } from "./DocColumn";
import { groupBySet } from "./salesDocGroups";
import {
  PROJECT_DOC_STATUS_LABELS,
  PROJECT_DOC_STATUS_STYLES,
  PROJECT_DOC_TYPE_LABELS,
  type ProjectDocument,
} from "../projectDocuments/types";
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

  async function handleStatusChange(status: ProjectStatus, reason?: string) {
    logDebug("ProjectDetail", `상태 변경 시도: project_id=${id}, status=${status}`);
    try {
      const updated = await apiPut<Project>(`/api/projects/${id}/status`, { status, reason: reason ?? null });
      setProject(updated);
      setShowDiscardForm(false);
    } catch (err) {
      logError("ProjectDetail", "상태 변경 실패", err);
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
              <div className="mt-4 pt-4 border-t border-border flex items-center gap-2">
                <input
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
          </div>

          <ScheduleProgressCard project={project} stages={stages} onUpdated={setProject} />

          <ProgressSectionCard project={project} onStagesChange={setStages} />

          <DateNotesCard project={project} />

          <PurchaseProgressCard projectId={project.id} />

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text-muted">견적서 · 거래명세서 · 발주서</h2>
            <div className="flex items-center gap-2">
              {(["purchase_order", "quotation", "statement", "set"] as const).map((type) => (
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
                  <span className={`text-xs px-2 py-1 font-medium shrink-0 ${PROJECT_DOC_STATUS_STYLES[doc.status]}`}>
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
