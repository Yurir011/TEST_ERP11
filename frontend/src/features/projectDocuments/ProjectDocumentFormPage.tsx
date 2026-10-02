import { FileDown, Info, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { ApprovalEndTitle } from "../../components/approval/ApprovalChainPicker";
import { useAuth } from "../../context/AuthContext";
import type { Client } from "../clients/types";
import type { Project } from "../projects/types";
import { ApiError, apiGet, apiPost, downloadFile } from "../../lib/api";
import { hasMenuPermission } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { ApproverPickerModal } from "./ApproverPickerModal";
import { askTaxInvoicePaymentReceived } from "./taxInvoicePaymentConfirm";
import {
  DOC_CURRENCY_LABELS,
  DOC_CURRENCY_SYMBOLS,
  EMPTY_PROJECT_DOC_ITEM,
  MAX_PROJECT_DOC_ITEMS,
  PROJECT_DOC_TYPE_LABELS,
  TAX_INVOICE_PURPOSE_HELP,
  type DocCurrency,
  type ProjectDocType,
  type ProjectDocument,
  type ProjectDocumentItemFormValues,
  type TaxInvoicePurpose,
} from "./types";

const CURRENCY_OPTIONS: DocCurrency[] = ["KRW", "USD", "JPY"];
const PURPOSE_OPTIONS: TaxInvoicePurpose[] = ["청구", "영수"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isProjectDocType(value: string | null): value is ProjectDocType {
  return value === "quotation" || value === "statement" || value === "tax_invoice";
}

export function ProjectDocumentFormPage() {
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type");
  // ?type=set 이면 견적서+거래명세서를 같은 내용으로 한 번에 작성하고, 한 번의 결재로 함께 승인/반려된다.
  const isSet = typeParam === "set";
  const docType: ProjectDocType = isProjectDocType(typeParam) ? typeParam : "quotation";
  const navigate = useNavigate();
  const { user } = useAuth();
  // 프로젝트 관리 화면에서 들어오면(/projects/:id/documents/new) 그 프로젝트가 미리 선택되고, 작성 후 그 화면으로 돌아간다.
  const { id: routeProjectId } = useParams<{ id: string }>();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [approvedQuotations, setApprovedQuotations] = useState<ProjectDocument[]>([]);
  const [loadedQuotationId, setLoadedQuotationId] = useState("");
  const [projectId, setProjectId] = useState(routeProjectId ?? "");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [clientName, setClientName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [currency, setCurrency] = useState<DocCurrency>("KRW");
  const [purposeType, setPurposeType] = useState<TaxInvoicePurpose>("청구");
  const [items, setItems] = useState<ProjectDocumentItemFormValues[]>([{ ...EMPTY_PROJECT_DOC_ITEM }]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApproverPicker, setShowApproverPicker] = useState(false);

  useEffect(() => {
    apiGet<Project[]>("/api/projects")
      .then((list) => setProjects(list.filter((p) => p.status !== "completed" || String(p.id) === routeProjectId)))
      .catch((err) => logError("ProjectDocumentForm", "프로젝트 목록 조회 실패", err));

    logDebug("ProjectDocumentForm", "거래처 목록 조회 시작 (거래처명 자동완성)");
    apiGet<Client[]>("/api/clients")
      .then(setClients)
      .catch((err) => logError("ProjectDocumentForm", "거래처 목록 조회 실패", err));
  }, []);

  useEffect(() => {
    if (docType !== "statement") return;
    logDebug("ProjectDocumentForm", "불러오기용 승인된 견적서 목록 조회 시작");
    apiGet<ProjectDocument[]>("/api/project-documents?doc_type=quotation&status=approved")
      .then(setApprovedQuotations)
      .catch((err) => logError("ProjectDocumentForm", "승인된 견적서 목록 조회 실패", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);

  function handleLoadQuotation(id: string) {
    setLoadedQuotationId(id);
    const quotation = approvedQuotations.find((q) => String(q.id) === id);
    if (!quotation) return;
    logDebug("ProjectDocumentForm", `견적서 불러오기: quotation_id=${quotation.id}`);
    setProjectId(String(quotation.project_id));
    setClientName(quotation.client_name);
    setManagerName(quotation.manager_name ?? "");
    setCurrency(quotation.currency);
    setItems(
      quotation.items.map((it) => ({
        content: it.content,
        quantity: String(it.quantity),
        unit_price: String(it.unit_price),
        note: it.note ?? "",
      }))
    );
  }

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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!projectId) {
      setError("관련 프로젝트를 선택해주세요.");
      return;
    }
    setShowApproverPicker(true);
  }

  async function handleRequestApproval(endTitle: ApprovalEndTitle | null, approverIds: number[], isFinalDecision: boolean) {
    const received = docType === "tax_invoice" ? askTaxInvoicePaymentReceived(purposeType, clientName) : null;
    setIsSubmitting(true);
    try {
      logDebug("ProjectDocumentForm", `결재요청 시도: end_title=${endTitle}, is_final_decision=${isFinalDecision}`);
      const endpoint = isSet ? "/api/project-documents/set" : "/api/project-documents";
      const createdResult = await apiPost<ProjectDocument | ProjectDocument[]>(endpoint, {
        project_id: Number(projectId),
        doc_type: docType,
        issue_date: issueDate,
        currency,
        purpose_type: purposeType,
        client_name: clientName,
        manager_name: managerName || null,
        items: items.map((it) => ({
          content: it.content,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          note: it.note || null,
        })),
        end_title: endTitle,
        approver_ids: approverIds,
        is_final_decision: isFinalDecision,
        received,
      });

      const createdDocs = Array.isArray(createdResult) ? createdResult : [createdResult];
      for (const created of createdDocs) {
        if (created.status === "approved" && created.has_pdf) {
          await downloadFile(
            `/api/project-documents/${created.id}/pdf`,
            `${PROJECT_DOC_TYPE_LABELS[created.doc_type]}_${issueDate}.pdf`
          );
        }
      }

      window.alert("결재 요청이 완료되었습니다.");
      navigate(routeProjectId ? `/projects/${routeProjectId}` : docType === "tax_invoice" ? "/tax-invoices" : "/project-documents", { replace: true });
    } catch (err) {
      logError("ProjectDocumentForm", "결재요청 실패", err);
      setError(err instanceof ApiError ? err.message : "결재요청 중 오류가 발생했습니다.");
      setShowApproverPicker(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (docType === "tax_invoice" && !hasMenuPermission(user, "tax_invoice")) {
    return <Navigate to="/tax-invoices" replace />;
  }

  return (
    <MainLayout title={isSet ? "새 견적서 · 거래명세서 작성" : `새 ${PROJECT_DOC_TYPE_LABELS[docType]} 작성`}>
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

        {isSet && (
          <div className="flex items-start gap-2 bg-tile-blue text-tile-blue-fg rounded-xl px-4 py-3 text-xs">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>
              입력한 내용으로 견적서와 거래명세서가 함께 만들어지고, 한 번의 결재로 두 문서가 같이 승인(또는 반려)됩니다.
            </p>
          </div>
        )}

        {docType === "statement" && !isSet && (
          <div className="bg-tile-blue text-tile-blue-fg rounded-xl px-4 py-3">
            <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
              <FileDown size={14} />
              승인된 견적서 불러오기 (선택)
            </label>
            <select
              value={loadedQuotationId}
              onChange={(e) => handleLoadQuotation(e.target.value)}
              className="w-full rounded-lg border border-primary/30 px-3 py-2 text-sm outline-none focus:border-primary bg-surface text-text"
            >
              <option value="">불러올 견적서 선택</option>
              {approvedQuotations.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.doc_no ?? `#${q.id}`} · {q.project_name} ({q.client_name}) · {q.issue_date}
                </option>
              ))}
            </select>
            <p className="text-[11px] mt-1.5 opacity-80">
              날짜를 제외한 프로젝트·거래처·담당자·품목이 그대로 자동입력됩니다.
              {approvedQuotations.length === 0 && " (승인된 견적서가 아직 없습니다)"}
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
            {(() => {
              const loaded = approvedQuotations.find((q) => String(q.id) === loadedQuotationId);
              if (!loaded || projects.some((p) => p.id === loaded.project_id)) return null;
              return (
                <option value={loaded.project_id}>
                  {loaded.project_name} ({loaded.client_name}) · 완료된 프로젝트
                </option>
              );
            })()}
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
              list="client-name-options"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
            <datalist id="client-name-options">
              {clients.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
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

        {docType === "tax_invoice" && (
          <div>
            <div className="flex items-center gap-2.5">
              <label className="text-xs text-text-muted shrink-0">작성목적</label>
              <select
                value={purposeType}
                onChange={(e) => setPurposeType(e.target.value as TaxInvoicePurpose)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg min-w-[140px]"
              >
                {PURPOSE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-text-muted mt-1.5">{TAX_INVOICE_PURPOSE_HELP[purposeType]}</p>
          </div>
        )}

        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-2 mt-3">
            <label className="block text-xs text-text-muted">
              품목 ({items.length}/{MAX_PROJECT_DOC_ITEMS})
            </label>
            <div className="flex items-center gap-3">
              {docType !== "tax_invoice" && (
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-text-muted">단가 단위</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as DocCurrency)}
                    className="rounded-lg border border-border px-2 py-1 text-xs outline-none focus:border-primary bg-bg"
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {DOC_CURRENCY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                    <label className="block text-[11px] text-text-muted mb-1">단가 ({DOC_CURRENCY_SYMBOLS[currency]})</label>
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
            결재요청
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

      {showApproverPicker && (
        <ApproverPickerModal
          isSubmitting={isSubmitting}
          onConfirm={handleRequestApproval}
          onCancel={() => setShowApproverPicker(false)}
        />
      )}
    </MainLayout>
  );
}
