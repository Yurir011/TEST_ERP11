import { ArrowLeft, Download, FileText, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { apiGet, apiPut, downloadFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logError } from "../../lib/logger";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_STYLES,
  SALES_DOC_LABELS,
  type Project,
  type ProjectStatus,
  type SalesDocument,
} from "./types";

const STATUS_OPTIONS: ProjectStatus[] = ["estimate", "in_progress", "completed"];

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
