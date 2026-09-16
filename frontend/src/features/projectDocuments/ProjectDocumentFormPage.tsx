import { Info, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import type { Project } from "../projects/types";
import { ApiError, apiGet, apiPost, downloadFile } from "../../lib/api";
import { hasMenuPermission } from "../../lib/auth";
import { logError } from "../../lib/logger";
import {
  EMPTY_PROJECT_DOC_ITEM,
  MAX_PROJECT_DOC_ITEMS,
  PROJECT_DOC_EXCEL_EXT,
  PROJECT_DOC_TYPE_LABELS,
  type ProjectDocType,
  type ProjectDocument,
  type ProjectDocumentItemFormValues,
} from "./types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isProjectDocType(value: string | null): value is ProjectDocType {
  return value === "quotation" || value === "statement" || value === "tax_invoice";
}

export function ProjectDocumentFormPage() {
  const [searchParams] = useSearchParams();
  const docType: ProjectDocType = isProjectDocType(searchParams.get("type")) ? searchParams.get("type")! : "quotation";
  const navigate = useNavigate();
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [clientName, setClientName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [items, setItems] = useState<ProjectDocumentItemFormValues[]>([{ ...EMPTY_PROJECT_DOC_ITEM }]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Project[]>("/api/projects")
      .then((list) => setProjects(list.filter((p) => p.status !== "completed")))
      .catch((err) => logError("ProjectDocumentForm", "프로젝트 목록 조회 실패", err));
  }, []);

  function handleProjectChange(id: string) {
    setProjectId(id);
    const project = projects.find((p) => String(p.id) === id);
    if (project && !clientName) {
      setClientName(project.client_name);
    }
  }

  function addItem() {
    setItems((prev) => (prev.length >= MAX_PROJECT_DOC_ITEMS ? prev : [...prev, { ...EMPTY_PROJECT_DOC_ITEM }]));
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updateItem(index: number, key: keyof ProjectDocumentItemFormValues, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [key]: value } : it)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!projectId) {
      setError("관련 프로젝트를 선택해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await apiPost<ProjectDocument>("/api/project-documents", {
        project_id: Number(projectId),
        doc_type: docType,
        issue_date: issueDate,
        client_name: clientName,
        manager_name: managerName || null,
        items: items.map((it) => ({
          content: it.content,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          note: it.note || null,
        })),
      });

      if (created.has_excel) {
        await downloadFile(
          `/api/project-documents/${created.id}/excel`,
          `${PROJECT_DOC_TYPE_LABELS[docType]}_${issueDate}${PROJECT_DOC_EXCEL_EXT[docType]}`
        );
      }

      navigate("/project-documents", { replace: true });
    } catch (err) {
      logError("ProjectDocumentForm", "등록 실패", err);
      setError(err instanceof ApiError ? err.message : "등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (docType === "tax_invoice" && !hasMenuPermission(user, "tax_invoice")) {
    return <Navigate to="/project-documents" replace />;
  }

  return (
    <MainLayout title={`새 ${PROJECT_DOC_TYPE_LABELS[docType]} 작성`}>
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-2xl">
        {docType === "tax_invoice" && (
          <div className="flex items-start gap-2 bg-tile-purple text-tile-purple-fg rounded-xl px-4 py-3 text-xs">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>
              세금계산서 발행은 홈택스·팝빌 연동 예정입니다. 지금은 관련 정보를 미리 기록해두는 용도로만
              사용해주세요.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs text-text-muted mb-1.5">관련 프로젝트</label>
          <select
            required
            value={projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          >
            <option value="" disabled>
              프로젝트 선택
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.client_name})
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <p className="text-xs text-text-muted mt-1.5">진행 중인 프로젝트가 없습니다. 먼저 프로젝트를 등록해주세요.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">날짜</label>
            <input
              type="date"
              required
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">거래처명</label>
            <input
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">담당자 (이름 + 직급)</label>
          <input
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            placeholder="예: 홍길동 과장"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-2 mt-3">
            <label className="block text-xs text-text-muted">
              품목 ({items.length}/{MAX_PROJECT_DOC_ITEMS})
            </label>
            <button
              type="button"
              onClick={addItem}
              disabled={items.length >= MAX_PROJECT_DOC_ITEMS}
              className="flex items-center gap-1 text-xs text-primary hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
              항목 추가
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="bg-bg rounded-xl p-3 relative">
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="absolute top-2 right-2 text-text-muted hover:text-danger"
                    title="항목 삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <p className="text-[11px] text-text-muted mb-2">품목 {index + 1}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-text-muted mb-1">내용</label>
                    <input
                      required
                      value={item.content}
                      onChange={(e) => updateItem(index, "content", e.target.value)}
                      className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-text-muted mb-1">수량</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-text-muted mb-1">단가</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                      className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-text-muted mb-1">비고</label>
                    <input
                      value={item.note}
                      onChange={(e) => updateItem(index, "note", e.target.value)}
                      className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
          >
            취소
          </button>
        </div>
      </form>
    </MainLayout>
  );
}
