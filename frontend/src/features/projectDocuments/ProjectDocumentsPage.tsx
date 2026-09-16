import { Download, FileSpreadsheet, FileText, Plus, Receipt, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { apiDelete, apiGet, downloadFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { hasMenuPermission } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { PROJECT_DOC_EXCEL_EXT, PROJECT_DOC_TYPE_LABELS, type ProjectDocType, type ProjectDocument } from "./types";

const NEW_DOC_ACTIONS: { type: ProjectDocType; icon: typeof FileText; colorClass: string }[] = [
  { type: "quotation", icon: FileText, colorClass: "text-tile-blue-fg" },
  { type: "statement", icon: FileSpreadsheet, colorClass: "text-tile-green-fg" },
  { type: "tax_invoice", icon: Receipt, colorClass: "text-tile-purple-fg" },
];

const TABS: { key: ProjectDocType | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "quotation", label: "견적서" },
  { key: "statement", label: "거래명세서" },
  { key: "tax_invoice", label: "세금계산서" },
];

function itemsSummary(doc: ProjectDocument): string {
  if (doc.items.length === 0) return "-";
  const first = doc.items[0].content;
  return doc.items.length > 1 ? `${first} 외 ${doc.items.length - 1}건` : first;
}

function itemsTotal(doc: ProjectDocument): number {
  return doc.items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
}

export function ProjectDocumentsPage() {
  const { user } = useAuth();
  const visibleActions = NEW_DOC_ACTIONS.filter(
    (action) => action.type !== "tax_invoice" || hasMenuPermission(user, "tax_invoice")
  );
  const [tab, setTab] = useState<ProjectDocType | "all">("all");
  const [docs, setDocs] = useState<ProjectDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  function loadDocs() {
    logDebug("ProjectDocuments", `목록 조회: type=${tab}`);
    const params = new URLSearchParams();
    if (tab !== "all") params.set("doc_type", tab);
    const qs = params.toString();
    apiGet<ProjectDocument[]>(`/api/project-documents${qs ? `?${qs}` : ""}`)
      .then(setDocs)
      .catch((err) => {
        logError("ProjectDocuments", "목록 조회 실패", err);
        setError("문서 목록을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleDelete(id: number) {
    if (!window.confirm("이 문서를 삭제할까요?")) return;
    try {
      await apiDelete(`/api/project-documents/${id}`);
      loadDocs();
    } catch (err) {
      logError("ProjectDocuments", "삭제 실패", err);
    }
  }

  async function handleDownload(doc: ProjectDocument) {
    setDownloadingId(doc.id);
    try {
      await downloadFile(
        `/api/project-documents/${doc.id}/excel`,
        `${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}_${doc.issue_date}${PROJECT_DOC_EXCEL_EXT[doc.doc_type]}`
      );
    } catch (err) {
      logError("ProjectDocuments", "엑셀 다운로드 실패", err);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <MainLayout
      title="문서관리"
      description="프로젝트별 견적서·거래명세서·세금계산서를 작성하고 관리합니다."
    >
      <div className={`grid gap-4 mb-6 ${visibleActions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {visibleActions.map(({ type, icon: Icon, colorClass }) => (
          <Link
            key={type}
            to={`/project-documents/new?type=${type}`}
            className="bg-surface border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors flex items-center gap-3"
          >
            <div className={`p-2.5 rounded-xl bg-bg ${colorClass}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-text">{PROJECT_DOC_TYPE_LABELS[type]} 작성</p>
              <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                <Plus size={11} />새 문서 등록
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
              tab === t.key ? "bg-bg font-medium text-text shadow-sm" : "text-text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {docs !== null && docs.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <FileText className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">등록된 문서가 없습니다.</p>
        </div>
      )}

      {docs !== null && docs.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2.5 px-4 font-medium">구분</th>
                <th className="py-2.5 px-4 font-medium">날짜</th>
                <th className="py-2.5 px-4 font-medium">프로젝트</th>
                <th className="py-2.5 px-4 font-medium">거래처명</th>
                <th className="py-2.5 px-4 font-medium">담당자</th>
                <th className="py-2.5 px-4 font-medium">내용</th>
                <th className="py-2.5 px-4 font-medium text-right">합계</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-4">
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-tile-blue text-tile-blue-fg">
                      {PROJECT_DOC_TYPE_LABELS[doc.doc_type]}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">{doc.issue_date}</td>
                  <td className="py-2.5 px-4">{doc.project_name}</td>
                  <td className="py-2.5 px-4">{doc.client_name}</td>
                  <td className="py-2.5 px-4">{doc.manager_name ?? "-"}</td>
                  <td className="py-2.5 px-4">{itemsSummary(doc)}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{formatCurrency(itemsTotal(doc))}</td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center justify-end gap-1">
                      {doc.has_excel && (
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                          className="p-1.5 text-text-muted hover:text-primary disabled:opacity-50"
                          title="엑셀 다운로드"
                        >
                          <Download size={14} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(doc.id)} className="p-1.5 text-text-muted hover:text-danger" title="삭제">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </MainLayout>
  );
}
