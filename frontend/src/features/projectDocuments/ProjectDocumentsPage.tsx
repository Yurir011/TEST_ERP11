import { Check, Download, FileSpreadsheet, FileText, Mail, Plus, Printer, Receipt, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, downloadFile, openFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { hasMenuPermission } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { ApproverPickerModal } from "./ApproverPickerModal";
import {
  PROJECT_DOC_STATUS_LABELS,
  PROJECT_DOC_STATUS_STYLES,
  PROJECT_DOC_TYPE_LABELS,
  type ApprovalRoute,
  type ProjectDocType,
  type ProjectDocument,
} from "./types";

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

function pdfFilename(doc: ProjectDocument): string {
  return `${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}_${doc.issue_date}.pdf`;
}

export function ProjectDocumentsPage() {
  const { user } = useAuth();
  const visibleActions = NEW_DOC_ACTIONS.filter(
    (action) => action.type !== "tax_invoice" || hasMenuPermission(user, "tax_invoice")
  );
  const [tab, setTab] = useState<ProjectDocType | "all">("all");
  const [docs, setDocs] = useState<ProjectDocument[] | null>(null);
  const [pendingForMe, setPendingForMe] = useState<ProjectDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resubmitDoc, setResubmitDoc] = useState<ProjectDocument | null>(null);

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

  function loadPendingForMe() {
    apiGet<ProjectDocument[]>("/api/project-documents?status=pending&approver_mine=true")
      .then(setPendingForMe)
      .catch((err) => logError("ProjectDocuments", "내 결재함 조회 실패", err));
  }

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    loadPendingForMe();
  }, []);

  function reloadAll() {
    loadDocs();
    loadPendingForMe();
  }

  async function handleDelete(id: number) {
    if (!window.confirm("이 문서를 삭제할까요?")) return;
    try {
      await apiDelete(`/api/project-documents/${id}`);
      reloadAll();
    } catch (err) {
      logError("ProjectDocuments", "삭제 실패", err);
      setError(err instanceof ApiError ? err.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  async function handleApprove(doc: ProjectDocument) {
    if (!window.confirm(`"${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}" 문서를 결재 승인하시겠습니까? 승인 후 PDF에 직인이 찍힙니다.`)) return;
    logDebug("ProjectDocuments", `결재 승인 시도: id=${doc.id}`);
    setBusyId(doc.id);
    try {
      await apiPut(`/api/project-documents/${doc.id}/approve`);
      reloadAll();
    } catch (err) {
      logError("ProjectDocuments", "결재 승인 실패", err);
      setError(err instanceof ApiError ? err.message : "결재 승인 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(doc: ProjectDocument) {
    const reason = window.prompt("반려 사유를 입력해주세요.");
    if (!reason || !reason.trim()) return;
    logDebug("ProjectDocuments", `결재 반려 시도: id=${doc.id}`);
    setBusyId(doc.id);
    try {
      await apiPut(`/api/project-documents/${doc.id}/reject`, { reason: reason.trim() });
      reloadAll();
    } catch (err) {
      logError("ProjectDocuments", "결재 반려 실패", err);
      setError(err instanceof ApiError ? err.message : "결재 반려 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResubmit(approvalRoute: ApprovalRoute, approverId: number | null) {
    if (!resubmitDoc) return;
    setBusyId(resubmitDoc.id);
    try {
      await apiPost(`/api/project-documents/${resubmitDoc.id}/request-approval`, {
        approval_route: approvalRoute,
        approver_id: approverId,
      });
      setResubmitDoc(null);
      reloadAll();
    } catch (err) {
      logError("ProjectDocuments", "재요청 실패", err);
      setError(err instanceof ApiError ? err.message : "결재 재요청 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(doc: ProjectDocument) {
    setBusyId(doc.id);
    try {
      await downloadFile(`/api/project-documents/${doc.id}/pdf`, pdfFilename(doc));
    } catch (err) {
      logError("ProjectDocuments", "PDF 다운로드 실패", err);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePrint(doc: ProjectDocument) {
    try {
      await openFile(`/api/project-documents/${doc.id}/pdf`);
    } catch (err) {
      logError("ProjectDocuments", "PDF 출력 열기 실패", err);
    }
  }

  async function handleSend(doc: ProjectDocument) {
    setBusyId(doc.id);
    try {
      await downloadFile(`/api/project-documents/${doc.id}/pdf`, pdfFilename(doc));
      const subject = encodeURIComponent(`${PROJECT_DOC_TYPE_LABELS[doc.doc_type]} - ${doc.project_name}`);
      const to = doc.client_contact_email ?? "";
      window.open(`mailto:${to}?subject=${subject}`, "_blank");
      if (!doc.client_contact_email) {
        window.alert("등록된 거래처 담당자 이메일이 없습니다. 다운로드된 PDF를 직접 첨부해 발송해주세요.");
      }
    } catch (err) {
      logError("ProjectDocuments", "발송용 다운로드 실패", err);
    } finally {
      setBusyId(null);
    }
  }

  const isApproved = (doc: ProjectDocument) => doc.status === "approved" && doc.has_pdf;

  return (
    <MainLayout title="문서관리" description="프로젝트별 견적서·거래명세서·세금계산서를 작성하고 관리합니다.">
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

      {pendingForMe.length > 0 && (
        <div className="bg-surface border border-tile-blue-fg/30 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">내 결재함 - 승인 대기 중인 문서 ({pendingForMe.length}건)</h2>
          <div className="space-y-2">
            {pendingForMe.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {PROJECT_DOC_TYPE_LABELS[doc.doc_type]} · {doc.project_name}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {doc.client_name} · {doc.issue_date} · 합계 {formatCurrency(itemsTotal(doc))}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(doc)}
                    disabled={busyId === doc.id}
                    className="flex items-center gap-1 text-xs text-success border border-success/30 rounded-lg px-3 py-1.5 hover:bg-success/10 disabled:opacity-50"
                  >
                    <Check size={14} />
                    승인
                  </button>
                  <button
                    onClick={() => handleReject(doc)}
                    disabled={busyId === doc.id}
                    className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-danger/10 disabled:opacity-50"
                  >
                    <X size={14} />
                    반려
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                <th className="py-2.5 px-4 font-medium">상태</th>
                <th className="py-2.5 px-4 font-medium">날짜</th>
                <th className="py-2.5 px-4 font-medium">프로젝트</th>
                <th className="py-2.5 px-4 font-medium">거래처명</th>
                <th className="py-2.5 px-4 font-medium">담당자</th>
                <th className="py-2.5 px-4 font-medium">내용</th>
                <th className="py-2.5 px-4 font-medium text-right">합계</th>
                <th className="w-36"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const approved = isApproved(doc);
                const disabledTitle = "결재 승인 후 이용 가능합니다.";
                return (
                  <tr key={doc.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 px-4">
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-tile-blue text-tile-blue-fg">
                        {PROJECT_DOC_TYPE_LABELS[doc.doc_type]}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${PROJECT_DOC_STATUS_STYLES[doc.status]}`}
                        title={doc.status === "rejected" ? doc.reject_reason ?? undefined : undefined}
                      >
                        {PROJECT_DOC_STATUS_LABELS[doc.status]}
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
                        {doc.status === "rejected" && doc.created_by === user?.id && (
                          <button
                            onClick={() => setResubmitDoc(doc)}
                            className="text-xs text-primary hover:opacity-80 border border-primary/30 rounded-lg px-2 py-1"
                          >
                            재요청
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={!approved || busyId === doc.id}
                          title={approved ? "저장 (PDF)" : disabledTitle}
                          className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => handlePrint(doc)}
                          disabled={!approved}
                          title={approved ? "출력" : disabledTitle}
                          className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Printer size={14} />
                        </button>
                        <button
                          onClick={() => handleSend(doc)}
                          disabled={!approved || busyId === doc.id}
                          title={approved ? "이메일 발송" : disabledTitle}
                          className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Mail size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={doc.status === "approved"}
                          title={doc.status === "approved" ? "승인된 문서는 삭제할 수 없습니다." : "삭제"}
                          className="p-1.5 text-text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resubmitDoc && (
        <ApproverPickerModal
          isSubmitting={busyId === resubmitDoc.id}
          onConfirm={handleResubmit}
          onCancel={() => setResubmitDoc(null)}
        />
      )}
    </MainLayout>
  );
}
