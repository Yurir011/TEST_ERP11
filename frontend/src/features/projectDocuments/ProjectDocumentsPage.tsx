import {
  Check,
  Download,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Mail,
  Plus,
  Printer,
  Receipt,
  Sheet,
  ShoppingCart,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { ApprovalEndTitle } from "../../components/approval/ApprovalChainPicker";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, downloadFile, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { ProposalsPage } from "../proposals/ProposalsPage";
import { ProposalDetailModal } from "../proposals/ProposalDetailModal";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_STYLES, type Proposal } from "../proposals/types";
import { HometaxImportModal } from "../transactions/HometaxImportModal";
import { ApproverPickerModal } from "./ApproverPickerModal";
import { useOpenTarget, type OpenOverlayProps } from "../../lib/useOpenTarget";
import { ProjectDocumentDetailModal } from "./ProjectDocumentDetailModal";
import { ProjectSearchBox } from "./ProjectSearchBox";
import { PopbillRequiredInfoModal, type PopbillClientInfo } from "./PopbillRequiredInfoModal";
import {
  DOC_CURRENCY_SYMBOLS,
  PROJECT_DOC_STATUS_LABELS,
  PROJECT_DOC_STATUS_STYLES,
  PROJECT_DOC_TYPE_LABELS,
  type ProjectDocType,
  type ProjectDocument,
  type ProjectDocumentStatus,
  type TaxInvoicePurpose,
} from "./types";
import { SOFT_BADGE } from "../../components/ui/softBadge";

type DocTab = ProjectDocType | "all" | "proposal";

const NEW_DOC_ACTIONS: { type: ProjectDocType; icon: typeof FileText; colorClass: string }[] = [
  { type: "purchase_order", icon: ShoppingCart, colorClass: "text-tile-orange-fg" },
  { type: "quotation", icon: FileText, colorClass: "text-tile-blue-fg" },
  { type: "statement", icon: FileSpreadsheet, colorClass: "text-tile-green-fg" },
  { type: "tax_invoice", icon: Receipt, colorClass: "text-tile-purple-fg" },
];

const TABS: { key: DocTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "proposal", label: "품의서" },
  { key: "purchase_order", label: "발주서" },
  { key: "quotation", label: "견적서" },
  { key: "statement", label: "거래명세서" },
  { key: "tax_invoice", label: "세금계산서" },
];

function isDocTab(value: string | null): value is DocTab {
  return value !== null && TABS.some((t) => t.key === value);
}

function itemsSummary(doc: ProjectDocument): string {
  if (doc.items.length === 0) return "-";
  const first = doc.items[0].content;
  return doc.items.length > 1 ? `${first} 외 ${doc.items.length - 1}건` : first;
}

function itemsTotal(doc: ProjectDocument): number {
  return doc.items.reduce((sum, it) => sum + Math.round(it.quantity * it.unit_price), 0);
}

function formatDocAmount(doc: ProjectDocument, amount: number): string {
  return `${DOC_CURRENCY_SYMBOLS[doc.currency]}${amount.toLocaleString()}`;
}

// ── "세금계산서 통계" 집계: 전월 대비 증감 + 청구/영수 비교. 금액은 KRW 문서만 합산한다 (외화는 드문 경우라 섞으면 왜곡됨). ──
function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function computeTaxInvoiceStats(docs: ProjectDocument[]) {
  const krwDocs = docs.filter((d) => d.currency === "KRW");
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const thisMonthDocs = krwDocs.filter((d) => monthKey(d.issue_date) === thisMonth);
  const thisMonthAmount = thisMonthDocs.reduce((sum, d) => sum + itemsTotal(d), 0);

  const issuedCount = docs.filter((d) => d.popbill_issued).length;
  const notIssuedCount = docs.length - issuedCount;

  const lastMonthDt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDt.getFullYear()}-${String(lastMonthDt.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDocs = krwDocs.filter((d) => monthKey(d.issue_date) === lastMonthKey);
  const lastMonthAmount = lastMonthDocs.reduce((sum, d) => sum + itemsTotal(d), 0);
  const momChangePct =
    lastMonthAmount > 0 ? ((thisMonthAmount - lastMonthAmount) / lastMonthAmount) * 100 : thisMonthAmount > 0 ? 100 : 0;

  return {
    totalCount: docs.length,
    thisMonthAmount,
    thisMonthCount: thisMonthDocs.length,
    issuedCount,
    notIssuedCount,
    lastMonthAmount,
    lastMonthCount: lastMonthDocs.length,
    momChangePct,
  };
}

// "세금계산서 통계" 카드 — 이번 달/전월 발행 금액(전월 대비 증감)과 팝빌 미발행 건수.
interface TaxInvoiceStatsCardProps {
  docs: ProjectDocument[];
  monthFilter: "all" | "this" | "last";
  onToggleMonth: (value: "this" | "last") => void;
  issuedFilter: "all" | "issued" | "not_issued";
  onToggleIssued: (value: "issued" | "not_issued") => void;
}

function TaxInvoiceStatsCard({
  docs,
  monthFilter,
  onToggleMonth,
  issuedFilter,
  onToggleIssued,
}: TaxInvoiceStatsCardProps) {
  const s = computeTaxInvoiceStats(docs);
  const isUp = s.momChangePct >= 0;

  const cardBase = "bg-bg rounded-xl p-4 text-left w-full transition-colors hover:bg-border/40 cursor-pointer";
  const activeRing = "ring-2 ring-primary";

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      <h2 className="text-sm font-semibold mb-1">세금계산서 통계</h2>
      <p className="text-xs text-text-muted mb-4">카드를 클릭하면 아래 목록이 해당 조건으로 필터링됩니다.</p>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <button
          onClick={() => onToggleMonth("this")}
          className={`${cardBase} ${monthFilter === "this" ? activeRing : ""}`}
        >
          <p className="text-xs text-text-muted">이번 달 발행 금액</p>
          <p className="text-lg font-semibold mt-1">₩{s.thisMonthAmount.toLocaleString()}</p>
          <p className={`text-xs mt-1.5 flex items-center gap-1 ${isUp ? "text-success" : "text-danger"}`}>
            {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            전월 대비 {isUp ? "+" : ""}
            {s.momChangePct.toFixed(1)}%
          </p>
        </button>
        <button
          onClick={() => onToggleMonth("last")}
          className={`${cardBase} ${monthFilter === "last" ? activeRing : ""}`}
        >
          <p className="text-xs text-text-muted">전월 발행 금액</p>
          <p className="text-lg font-semibold mt-1 text-text-muted">₩{s.lastMonthAmount.toLocaleString()}</p>
          <p className="text-xs text-text-muted mt-1.5">{s.lastMonthCount}건</p>
        </button>
        <button
          onClick={() => onToggleIssued("not_issued")}
          className={`${cardBase} ${issuedFilter === "not_issued" ? activeRing : ""}`}
        >
          <p className="text-xs text-text-muted">팝빌 미발행</p>
          <p className="text-lg font-semibold mt-1 text-tile-orange-fg">{s.notIssuedCount}건</p>
          <p className="text-xs text-text-muted mt-1.5">전체 {s.totalCount}건 중</p>
        </button>
      </div>
    </div>
  );
}

function pdfFilename(doc: ProjectDocument): string {
  return `${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}_${doc.issue_date}.pdf`;
}

function excelFilename(doc: ProjectDocument): string {
  return `${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}_${doc.issue_date}.xlsx`;
}

interface ProjectDocumentsPageProps extends OpenOverlayProps {
  embedded?: boolean;
  lockedDocType?: ProjectDocType;
}

export function ProjectDocumentsPage({
  embedded = false,
  lockedDocType,
  openId,
  modalOnly = false,
  onDecided,
  onModalClose,
}: ProjectDocumentsPageProps) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // 세금계산서는 매입매출/입출금관리처럼 우측 상단 "새 ... 등록" 버튼으로 작성하므로 카드는 두지 않는다.
  const visibleActions = lockedDocType
    ? NEW_DOC_ACTIONS.filter((action) => action.type === lockedDocType && action.type !== "tax_invoice")
    : NEW_DOC_ACTIONS.filter((action) => action.type !== "tax_invoice");
  const visibleTabs = TABS.filter((t) => t.key !== "tax_invoice");
  // 업무 알림("결재 요청") 클릭 시 ?tab=proposal 등으로 해당 탭(내 결재함)에 바로 진입할 수 있게 한다.
  const tabParam = searchParams.get("tab");
  const initialTab = lockedDocType ?? (isDocTab(tabParam) ? tabParam : "all");
  const [tab, setTab] = useState<DocTab>(initialTab);
  const [docs, setDocs] = useState<ProjectDocument[] | null>(null);
  const [pendingForMe, setPendingForMe] = useState<ProjectDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resubmitDoc, setResubmitDoc] = useState<ProjectDocument | null>(null);
  const [popbillInfoTarget, setPopbillInfoTarget] = useState<{
    doc: ProjectDocument;
    client_name: string;
    missing: string[];
    values: PopbillClientInfo;
  } | null>(null);
  const [deleteRequestDoc, setDeleteRequestDoc] = useState<ProjectDocument | null>(null);
  const [detailDoc, setDetailDoc] = useState<ProjectDocument | null>(null);
  // "전체" 탭에서는 품의서도 같은 목록에 함께 보여준다.
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalDetail, setProposalDetail] = useState<Proposal | null>(null);
  const openTargetId = useOpenTarget(openId);
  const openedTargetRef = useRef(false);
  const listTopRef = useRef<HTMLDivElement>(null);

  // 통계 카드를 누르면 필터가 적용된 목록이 바로 보이도록 목록 위치로 스크롤한다.
  function scrollToList(label: string) {
    logDebug("ProjectDocuments", `통계 카드 클릭 → 목록으로 이동: ${label}`);
    window.setTimeout(() => listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // 업무 알림(?open=문서ID)으로 들어오면 해당 문서 상세를 바로 연다. 승인/반려 이후에도 동일하게 열린다.
  useEffect(() => {
    if (openTargetId === null || openedTargetRef.current || docs === null) return;
    const target = docs.find((d) => d.id === openTargetId) ?? pendingForMe.find((d) => d.id === openTargetId);
    if (target) {
      openedTargetRef.current = true;
      logDebug("ProjectDocuments", `알림에서 문서 상세 열기: id=${openTargetId}`);
      setDetailDoc(target);
    }
  }, [openTargetId, docs, pendingForMe]);
  const [purposeFilter, setPurposeFilter] = useState<"all" | TaxInvoicePurpose>("all");
  const [paperFilter, setPaperFilter] = useState<"all" | "electronic" | "paper">("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "sales" | "purchase">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectDocumentStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState<"all" | "this" | "last">("all");
  const [issuedFilter, setIssuedFilter] = useState<"all" | "issued" | "not_issued">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [showHometax, setShowHometax] = useState(false);

  function loadDocs() {
    if (tab === "proposal") return;
    logDebug("ProjectDocuments", `목록 조회: type=${tab}`);
    const params = new URLSearchParams();
    if (tab !== "all") params.set("doc_type", tab);
    const qs = params.toString();
    apiGet<ProjectDocument[]>(`/api/project-documents${qs ? `?${qs}` : ""}`)
      .then((list) => setDocs(lockedDocType ? list : list.filter((d) => d.doc_type !== "tax_invoice")))
      .catch((err) => {
        logError("ProjectDocuments", "목록 조회 실패", err);
        setError("문서 목록을 불러오지 못했습니다.");
      });
  }

  function loadProposals() {
    if (lockedDocType || tab !== "all") {
      setProposals([]);
      return;
    }
    logDebug("ProjectDocuments", "전체 목록용 품의서 조회 시작");
    apiGet<Proposal[]>("/api/proposals")
      .then(setProposals)
      .catch((err) => logError("ProjectDocuments", "품의서 목록 조회 실패", err));
  }

  function loadPendingForMe() {
    apiGet<ProjectDocument[]>("/api/project-documents?status=pending&approver_mine=true")
      .then((list) =>
        setPendingForMe(
          lockedDocType ? list.filter((d) => d.doc_type === lockedDocType) : list.filter((d) => d.doc_type !== "tax_invoice")
        )
      )
      .catch((err) => logError("ProjectDocuments", "내 결재함 조회 실패", err));
  }

  useEffect(() => {
    loadDocs();
    loadProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    loadPendingForMe();
    // 화면에 처음 들어올 때 한 번만 조회한다 (이후에는 reloadAll 이 갱신)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reloadAll() {
    loadDocs();
    loadProposals();
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

  // 승인된 문서는 바로 삭제할 수 없고, 결재선을 지정해 삭제 결재를 요청한다. 최종 승인되면 삭제된다.
  function handleDeleteClick(doc: ProjectDocument) {
    if (doc.status !== "approved") {
      handleDelete(doc.id);
      return;
    }
    const issuedNote = doc.popbill_issued
      ? "\n\n※ 팝빌로 이미 발행(국세청 전송)된 세금계산서입니다. 여기서 삭제해도 국세청 발행은 취소되지 않으며, 취소는 수정세금계산서를 별도로 발행해야 합니다."
      : "";
    const ledgerNote = doc.doc_type === "tax_invoice" ? "\n최종 승인되면 연결된 매입매출 내역과 입출금 내역도 함께 삭제됩니다." : "";
    if (
      !window.confirm(
        `승인된 ${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}는 결재를 거쳐야 삭제됩니다. 삭제 결재를 요청할까요?${ledgerNote}${issuedNote}`
      )
    ) {
      return;
    }
    logDebug("ProjectDocuments", `삭제 결재 요청 시작: doc_id=${doc.id}`);
    setDeleteRequestDoc(doc);
  }

  async function handleRequestDelete(endTitle: ApprovalEndTitle | null, approverIds: number[], isFinalDecision: boolean) {
    if (!deleteRequestDoc) return;
    setBusyId(deleteRequestDoc.id);
    try {
      await apiPost(`/api/project-documents/${deleteRequestDoc.id}/request-delete`, {
        end_title: endTitle,
        approver_ids: approverIds,
        is_final_decision: isFinalDecision,
      });
      logDebug("ProjectDocuments", `삭제 결재 요청 성공: doc_id=${deleteRequestDoc.id}`);
      setDeleteRequestDoc(null);
      reloadAll();
      window.alert(isFinalDecision ? "삭제되었습니다." : "삭제 결재 요청이 완료되었습니다. 최종 승인되면 삭제됩니다.");
    } catch (err) {
      logError("ProjectDocuments", "삭제 결재 요청 실패", err);
      setDeleteRequestDoc(null);
      setError(err instanceof ApiError ? err.message : "삭제 결재 요청 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(doc: ProjectDocument) {
    const approveMessage = doc.delete_requested
      ? `"${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}"의 삭제 요청을 승인하시겠습니까? 최종 승인되면 문서가 삭제됩니다.`
      : `"${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}" 문서를 결재 승인하시겠습니까? 승인 후 PDF에 직인이 찍힙니다.`;
    if (!window.confirm(approveMessage)) return;
    logDebug("ProjectDocuments", `결재 승인 시도: id=${doc.id}`);
    setBusyId(doc.id);
    try {
      await apiPut(`/api/project-documents/${doc.id}/approve`);
      setDetailDoc(null);
      reloadAll();
      window.alert("결재 승인되었습니다.");
      onDecided?.();
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
      setDetailDoc(null);
      reloadAll();
      onDecided?.();
    } catch (err) {
      logError("ProjectDocuments", "결재 반려 실패", err);
      setError(err instanceof ApiError ? err.message : "결재 반려 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResubmit(endTitle: ApprovalEndTitle | null, approverIds: number[], isFinalDecision: boolean) {
    if (!resubmitDoc) return;
    const received = null;
    setBusyId(resubmitDoc.id);
    try {
      await apiPost(`/api/project-documents/${resubmitDoc.id}/request-approval`, {
        end_title: endTitle,
        approver_ids: approverIds,
        is_final_decision: isFinalDecision,
        received,
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

  async function handleDownloadExcel(doc: ProjectDocument) {
    setBusyId(doc.id);
    try {
      await downloadFile(`/api/project-documents/${doc.id}/excel`, excelFilename(doc));
    } catch (err) {
      logError("ProjectDocuments", "엑셀 다운로드 실패", err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleExportTaxInvoicesExcel() {
    setIsExportingExcel(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const qs = params.toString();
      const rangeLabel = dateFrom || dateTo ? `${dateFrom || "처음"}~${dateTo || "지금"}` : "전체";
      await downloadFile(
        `/api/project-documents/export/tax-invoices-excel${qs ? `?${qs}` : ""}`,
        `세금계산서_${rangeLabel}.xlsx`
      );
    } catch (err) {
      logError("ProjectDocuments", "세금계산서 목록 엑셀 다운로드 실패", err);
      setError("세금계산서 목록을 다운로드하지 못했습니다.");
    } finally {
      setIsExportingExcel(false);
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

  async function handlePopbillIssue(doc: ProjectDocument) {
    logDebug("ProjectDocuments", `팝빌 필수정보 점검 시작: doc_id=${doc.id}`);
    setBusyId(doc.id);
    try {
      const info = await apiGet<{ client_name: string; missing: string[]; values: PopbillClientInfo }>(
        `/api/project-documents/${doc.id}/popbill/required-info`
      );
      if (info.missing.length > 0) {
        logDebug("ProjectDocuments", `팝빌 필수정보 부족 → 입력 팝업: doc_id=${doc.id}, missing=${info.missing.join(",")}`);
        setPopbillInfoTarget({ doc, ...info });
        return;
      }
    } catch (err) {
      logError("ProjectDocuments", "팝빌 필수정보 점검 실패", err);
      window.alert(err instanceof ApiError ? err.message : "발행 정보를 확인하는 중 오류가 발생했습니다.");
      return;
    } finally {
      setBusyId(null);
    }
    await issuePopbill(doc);
  }

  async function issuePopbill(doc: ProjectDocument, info?: PopbillClientInfo) {
    if (!window.confirm("이 세금계산서를 팝빌로 발행하시겠습니까? 발행 즉시 국세청에 전송되며, 이후에는 취소(수정발행)만 가능합니다.")) {
      return;
    }
    logDebug("ProjectDocuments", `팝빌 발행 시도: doc_id=${doc.id}`);
    setBusyId(doc.id);
    try {
      const result = await apiPost<{ nts_confirm_num: string; issued_at: string }>(
        `/api/project-documents/${doc.id}/popbill/issue`,
        info
      );
      setPopbillInfoTarget(null);
      setDetailDoc((prev) =>
        prev && prev.id === doc.id
          ? { ...prev, popbill_issued: true, popbill_nts_confirm_num: result.nts_confirm_num, popbill_issued_at: result.issued_at }
          : prev
      );
      reloadAll();
    } catch (err) {
      logError("ProjectDocuments", "팝빌 발행 실패", err);
      window.alert(err instanceof ApiError ? err.message : "팝빌 발행 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePopbillView(doc: ProjectDocument) {
    setBusyId(doc.id);
    try {
      const { url } = await apiGet<{ url: string }>(`/api/project-documents/${doc.id}/popbill/view-url`);
      window.open(url, "_blank");
    } catch (err) {
      logError("ProjectDocuments", "팝빌 보기 URL 조회 실패", err);
      window.alert(err instanceof ApiError ? err.message : "팝빌 문서를 여는 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePopbillPdf(doc: ProjectDocument) {
    setBusyId(doc.id);
    try {
      const { url } = await apiGet<{ url: string }>(`/api/project-documents/${doc.id}/popbill/pdf-url`);
      window.open(url, "_blank");
    } catch (err) {
      logError("ProjectDocuments", "팝빌 PDF URL 조회 실패", err);
      window.alert(err instanceof ApiError ? err.message : "팝빌 PDF를 여는 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleProposalApprove(p: Proposal) {
    if (!window.confirm(`"${p.title}" 품의서를 결재 승인하시겠습니까?`)) return;
    logDebug("ProjectDocuments", `품의서 결재 승인 시도: id=${p.id}`);
    setBusyId(p.id);
    try {
      await apiPut(`/api/proposals/${p.id}/approve`);
      setProposalDetail(null);
      reloadAll();
      window.alert("결재 승인되었습니다.");
    } catch (err) {
      logError("ProjectDocuments", "품의서 결재 승인 실패", err);
      setError(err instanceof ApiError ? err.message : "결재 승인 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleProposalReject(p: Proposal) {
    const reason = window.prompt("반려 사유를 입력해주세요.");
    if (!reason || !reason.trim()) return;
    logDebug("ProjectDocuments", `품의서 결재 반려 시도: id=${p.id}`);
    setBusyId(p.id);
    try {
      await apiPut(`/api/proposals/${p.id}/reject`, { reason: reason.trim() });
      setProposalDetail(null);
      reloadAll();
    } catch (err) {
      logError("ProjectDocuments", "품의서 결재 반려 실패", err);
      setError(err instanceof ApiError ? err.message : "결재 반려 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleProposalDownload(p: Proposal) {
    setBusyId(p.id);
    try {
      await downloadFile(`/api/proposals/${p.id}/pdf`, `품의서_${p.issue_date}.pdf`);
    } catch (err) {
      logError("ProjectDocuments", "품의서 PDF 다운로드 실패", err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleProposalPrint(p: Proposal) {
    try {
      await openFile(`/api/proposals/${p.id}/pdf`);
    } catch (err) {
      logError("ProjectDocuments", "품의서 PDF 출력 열기 실패", err);
    }
  }

  const isApproved = (doc: ProjectDocument) => doc.status === "approved" && doc.has_pdf;
  const newDocCardCount = visibleActions.length + (lockedDocType ? 0 : 1);
  const newDocGridCols = newDocCardCount >= 4 ? "grid-cols-4" : newDocCardCount === 3 ? "grid-cols-3" : newDocCardCount === 2 ? "grid-cols-2" : "grid-cols-1";

  // 세금계산서 목록은 청구/영수 구분, 상태, 자유 검색으로 다방면 조회가 가능해야 한다.
  const q = searchQuery.trim().toLowerCase();
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

  // 검색창 자동완성 목록: 최근 1년 안에 발행일이 있는 문서의 프로젝트명 (중복 제거, 가나다순).
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  const recentProjectNames = Array.from(
    new Set((docs ?? []).filter((d) => d.issue_date >= oneYearAgo && d.project_name).map((d) => d.project_name))
  ).sort((x, y) => x.localeCompare(y, "ko"));

  const visibleDocs =
    docs === null
      ? null
      : docs.filter((doc) => {
          if (lockedDocType !== "tax_invoice") return true;
          if (paperFilter === "paper" && !doc.is_paper) return false;
          if (paperFilter === "electronic" && doc.is_paper) return false;
          if (directionFilter !== "all" && (doc.direction === "purchase" ? "purchase" : "sales") !== directionFilter) return false;
          if (purposeFilter !== "all" && doc.purpose_type !== purposeFilter) return false;
          if (statusFilter !== "all" && doc.status !== statusFilter) return false;
          if (issuedFilter === "issued" && !doc.popbill_issued) return false;
          if (issuedFilter === "not_issued" && doc.popbill_issued) return false;
          if (monthFilter === "this" && monthKey(doc.issue_date) !== thisMonthKey) return false;
          if (monthFilter === "last" && monthKey(doc.issue_date) !== lastMonthKey) return false;
          if (dateFrom && doc.issue_date < dateFrom) return false;
          if (dateTo && doc.issue_date > dateTo) return false;
          if (
            q &&
            !`${doc.project_name} ${doc.client_name} ${doc.manager_name ?? ""} ${doc.doc_no ?? ""}`
              .toLowerCase()
              .includes(q)
          ) {
            return false;
          }
          return true;
        });

  // 표에 그릴 행: 전체 탭이면 문서와 품의서를 발행일 최신순으로 섞고, 그 외 탭은 문서만 그대로 쓴다.
  type ListRow = { kind: "doc"; doc: ProjectDocument } | { kind: "proposal"; proposal: Proposal };
  const mergedRows: ListRow[] | null =
    visibleDocs === null
      ? null
      : (() => {
          const rows: ListRow[] = visibleDocs.map((doc): ListRow => ({ kind: "doc", doc }));
          if (lockedDocType || tab !== "all") return rows;
          const all: ListRow[] = [...rows, ...proposals.map((proposal): ListRow => ({ kind: "proposal", proposal }))];
          const dateOf = (r: ListRow) => (r.kind === "doc" ? r.doc.issue_date : r.proposal.issue_date);
          return all.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
        })();

  // 검색 결과 합계: 원화(KRW) 문서만 합산한다 (외화는 섞으면 왜곡되므로 건수만 안내).
  const visibleKrwTotal = (visibleDocs ?? []).filter((d) => d.currency === "KRW").reduce((sum, d) => sum + itemsTotal(d), 0);
  const foreignCount = (visibleDocs ?? []).filter((d) => d.currency !== "KRW").length;

  const content = (
    <>
      {!modalOnly && (
      <>
      {newDocCardCount > 0 && (
      <div className={`grid gap-4 mb-6 ${newDocGridCols}`}>
        {!lockedDocType && (
          <Link
            to="/proposals/new"
            className="bg-surface border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-bg text-tile-orange-fg">
              <FileSignature size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-text">품의서 작성</p>
              <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                <Plus size={11} />새 문서 등록
              </p>
            </div>
          </Link>
        )}
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
              <p className="text-sm font-medium text-text">{type === "tax_invoice" ? "세금계산서 작성 및 등록" : `${PROJECT_DOC_TYPE_LABELS[type]} 작성`}</p>
              <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                <Plus size={11} />새 문서 등록
              </p>
            </div>
          </Link>
        ))}
      </div>
      )}

      {lockedDocType === "tax_invoice" && docs !== null && (
        <TaxInvoiceStatsCard
          docs={docs}
          monthFilter={monthFilter}
          onToggleMonth={(v) => {
            setMonthFilter((prev) => (prev === v ? "all" : v));
            setDateFrom("");
            setDateTo("");
            scrollToList(`발행월=${v}`);
          }}
          issuedFilter={issuedFilter}
          onToggleIssued={(v) => {
            setIssuedFilter((prev) => (prev === v ? "all" : v));
            scrollToList(`팝빌발행=${v}`);
          }}
        />
      )}

      {tab !== "proposal" && pendingForMe.length > 0 && (
        <div className="bg-surface border border-tile-blue-fg/30 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">내 결재함 - 승인 대기 중인 문서 ({pendingForMe.length}건)</h2>
          <div className="space-y-2">
            {pendingForMe.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {doc.delete_requested && <span className="text-danger">[삭제 요청] </span>}
                    {PROJECT_DOC_TYPE_LABELS[doc.doc_type]} · {doc.project_name}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {doc.client_name} · {doc.issue_date}
                    {doc.doc_no && ` · No. ${doc.doc_no}`} · 합계 {formatDocAmount(doc, itemsTotal(doc))}
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

      {!lockedDocType && (
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit mb-5">
          {visibleTabs.map((t) => (
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
      )}

      {tab === "proposal" ? (
        <ProposalsPage embedded />
      ) : (
        <>
      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {lockedDocType === "tax_invoice" && docs !== null && docs.length > 0 && (
        <div ref={listTopRef} className="flex flex-wrap items-center gap-x-16 gap-y-3 mb-4 scroll-mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-text-muted">구분</span>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as typeof directionFilter)}
              className="text-xs border border-border rounded-lg px-2.5 py-2 bg-surface outline-none focus:border-primary"
            >
              <option value="all">매입/매출 전체</option>
              <option value="sales">매출</option>
              <option value="purchase">매입</option>
            </select>
            <select
              value={paperFilter}
              onChange={(e) => setPaperFilter(e.target.value as typeof paperFilter)}
              className="text-xs border border-border rounded-lg px-2.5 py-2 bg-surface outline-none focus:border-primary"
            >
              <option value="all">발행형태 전체</option>
              <option value="electronic">전자</option>
              <option value="paper">종이</option>
            </select>
            <select
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value as typeof purposeFilter)}
              className="text-xs border border-border rounded-lg px-2.5 py-2 bg-surface outline-none focus:border-primary"
            >
              <option value="all">청구/영수 전체</option>
              <option value="청구">청구</option>
              <option value="영수">영수</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | ProjectDocumentStatus)}
              className="text-xs border border-border rounded-lg px-2.5 py-2 bg-surface outline-none focus:border-primary"
            >
              <option value="all">상태 전체</option>
              <option value="draft">{PROJECT_DOC_STATUS_LABELS.draft}</option>
              <option value="pending">{PROJECT_DOC_STATUS_LABELS.pending}</option>
              <option value="approved">{PROJECT_DOC_STATUS_LABELS.approved}</option>
              <option value="rejected">{PROJECT_DOC_STATUS_LABELS.rejected}</option>
            </select>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-text-muted">기간</span>
            <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
              {([["this", "당월"], ["last", "전월"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    logDebug("ProjectDocuments", `기간 빠른 선택: ${label}`);
                    setMonthFilter((prev) => (prev === key ? "all" : key));
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    monthFilter === key ? "bg-tile-blue text-tile-blue-fg font-semibold" : "text-text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setMonthFilter("all");
                }}
                className="text-xs border border-border rounded-lg px-2.5 py-2 bg-surface outline-none focus:border-primary"
              />
              <span className="text-text-muted text-xs">~</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setMonthFilter("all");
                }}
                className="text-xs border border-border rounded-lg px-2.5 py-2 bg-surface outline-none focus:border-primary"
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="text-xs text-text-muted hover:text-text px-1"
                  title="기간 초기화"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <ProjectSearchBox value={searchQuery} onChange={setSearchQuery} projectNames={recentProjectNames} />

            <span className="text-xs text-text-muted shrink-0">
              {visibleDocs?.length ?? 0}건 · 합계{" "}
              <span className="font-semibold text-text">₩{visibleKrwTotal.toLocaleString()}</span>
              {foreignCount > 0 && ` (외화 ${foreignCount}건 제외)`}
            </span>
          </div>
        </div>
      )}

      {mergedRows !== null && mergedRows.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <FileText className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">
            {docs && docs.length > 0 ? "조건에 맞는 문서가 없습니다." : "등록된 문서가 없습니다."}
          </p>
        </div>
      )}

      {mergedRows !== null && mergedRows.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          {/* 표 스타일: 연한 세로선 + 줄무늬 + 톤다운 파랑 머리글 (첫 열 앞만 제외). 짧은 열은 내용 폭에 맞춘다. */}
          <table className="w-full text-sm [&_th:not(:first-child)]:border-l [&_th:not(:first-child)]:border-primary/[0.12] [&_td:not(:first-child)]:border-l [&_td:not(:first-child)]:border-text/[0.07]">
            <thead>
              <tr className="text-center bg-primary/[0.06] border-b border-border">
                {lockedDocType === "tax_invoice" && <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">구분</th>}
                {lockedDocType !== "tax_invoice" && (
                  <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">구분</th>
                )}
                <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">상태</th>
                {lockedDocType === "tax_invoice" && (
                  <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">팝빌</th>
                )}
                <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">날짜</th>
                <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center">프로젝트</th>
                <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center">거래처명</th>
                <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">담당자</th>
                <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center">내용</th>
                <th className="py-2.5 px-4 font-semibold text-[#3A4F7A] text-center w-px whitespace-nowrap">합계</th>
                <th className="w-px whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {mergedRows.map((row) => {
                if (row.kind === "proposal") {
                  const p = row.proposal;
                  const pApproved = p.status === "approved" && p.has_pdf;
                  return (
                    <tr
                      key={`p${p.id}`}
                      onClick={() => setProposalDetail(p)}
                      className="cursor-pointer hover:bg-primary/10 even:bg-text/[0.025] transition-colors"
                    >
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.orange}`}>{p.kind ? `${p.kind}품의서` : "품의서"}</span>
                      </td>
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`text-xs px-2 py-1 font-medium ${PROPOSAL_STATUS_STYLES[p.status]}`}
                          title={p.status === "rejected" ? p.reject_reason ?? undefined : undefined}
                        >
                          {PROPOSAL_STATUS_LABELS[p.status]}
                        </span>
                        {p.is_final_decision && p.status === "approved" && (
                          <span className={`ml-1.5 text-xs px-2 py-1 font-medium ${SOFT_BADGE.purple}`}>전결</span>
                        )}
                        {p.delete_requested && <span className={`ml-1.5 text-xs px-2 py-1 font-medium ${SOFT_BADGE.red}`}>삭제 결재 중</span>}
                      </td>
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        {p.issue_date}
                        <p className="text-xs text-text-muted mt-0.5">No. {p.doc_no}</p>
                      </td>
                      <td className="py-2.5 px-4 text-center text-text-muted">-</td>
                      <td className="py-2.5 px-4 text-center text-text-muted">-</td>
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">{p.creator_name}</td>
                      <td className="py-2.5 px-4 text-center">{p.title}</td>
                      <td className="py-2.5 px-4 text-right text-text-muted whitespace-nowrap">-</td>
                      <td className="py-2.5 px-2 w-px whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleProposalDownload(p)}
                            disabled={!pApproved || busyId === p.id}
                            title={pApproved ? "저장 (PDF)" : "결재 승인 후 이용 가능합니다."}
                            className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleProposalPrint(p)}
                            disabled={!pApproved}
                            title={pApproved ? "출력" : "결재 승인 후 이용 가능합니다."}
                            className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Printer size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const doc = row.doc;
                const approved = isApproved(doc);
                const disabledTitle = "결재 승인 후 이용 가능합니다.";
                return (
                  <tr
                    key={doc.id}
                    onClick={() => setDetailDoc(doc)}
                    className="cursor-pointer hover:bg-primary/10 even:bg-text/[0.025] transition-colors"
                  >
                    {lockedDocType === "tax_invoice" && (
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        {/* 종이 세금계산서는 항상 매입이므로 "매입" 배지 없이 "종이"만 표시한다. */}
                        {doc.is_paper ? (
                          <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.gray}`}>종이</span>
                        ) : (
                          <span
                            className={`text-xs px-2 py-1 font-medium ${
                              doc.direction === "purchase" ? SOFT_BADGE.orange : SOFT_BADGE.purple
                            }`}
                          >
                            {doc.direction === "purchase" ? "매입" : "매출"}
                          </span>
                        )}
                      </td>
                    )}
                    {lockedDocType !== "tax_invoice" && (
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.blue}`}>
                          {PROJECT_DOC_TYPE_LABELS[doc.doc_type]}
                        </span>
                      </td>
                    )}
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      <span
                        className={`text-xs px-2 py-1 font-medium ${PROJECT_DOC_STATUS_STYLES[doc.status]}`}
                        title={doc.status === "rejected" ? doc.reject_reason ?? undefined : undefined}
                      >
                        {PROJECT_DOC_STATUS_LABELS[doc.status]}
                      </span>
                      {doc.is_final_decision && doc.status === "approved" && (
                        <span className={`ml-1.5 text-xs px-2 py-1 font-medium ${SOFT_BADGE.purple}`}>전결</span>
                      )}
                      {doc.delete_requested && (
                        <span className={`ml-1.5 text-xs px-2 py-1 font-medium ${SOFT_BADGE.red}`}>삭제 결재 중</span>
                      )}
                    </td>
                    {lockedDocType === "tax_invoice" && (
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        {/* 팝빌 발행 대상은 매출 세금계산서뿐이다. 발행됨 / 승인되어 발행 대기 / 그 외(-) 로 나눈다. */}
                        {doc.popbill_issued ? (
                          <span
                            className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.green}`}
                            title={`국세청 승인번호 ${doc.popbill_nts_confirm_num}`}
                          >
                            발행
                          </span>
                        ) : doc.direction !== "purchase" && doc.status === "approved" && !doc.delete_requested ? (
                          <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.orange}`} title="승인되었으나 아직 팝빌로 발행하지 않았습니다.">
                            대기
                          </span>
                        ) : (
                          <span className="text-text-muted/50">-</span>
                        )}
                      </td>
                    )}
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      {doc.issue_date}
                      {doc.doc_no && <p className="text-xs text-text-muted mt-0.5">No. {doc.doc_no}</p>}
                    </td>
                    <td className="py-2.5 px-4 text-center">{doc.project_name}</td>
                    <td className="py-2.5 px-4 text-center">{doc.client_name}</td>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">{doc.manager_name ?? "-"}</td>
                    <td className="py-2.5 px-4 text-center">{itemsSummary(doc)}</td>
                    <td className="py-2.5 px-4 text-right font-medium whitespace-nowrap">{formatDocAmount(doc, itemsTotal(doc))}</td>
                    <td className="py-2.5 px-2 w-px whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {doc.status === "rejected" && doc.created_by === user?.id && (
                          <button
                            onClick={() => setResubmitDoc(doc)}
                            className="text-xs text-primary hover:opacity-80 border border-primary/30 rounded-lg px-2 py-1 whitespace-nowrap shrink-0"
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
                          onClick={() => handleDownloadExcel(doc)}
                          disabled={!doc.has_excel || busyId === doc.id}
                          title={doc.has_excel ? "저장 (엑셀)" : disabledTitle}
                          className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Sheet size={14} />
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
                          onClick={() => handleDeleteClick(doc)}
                          disabled={doc.delete_requested}
                          title={doc.delete_requested ? "삭제 결재가 진행 중입니다." : doc.status === "approved" ? "삭제 결재 요청" : "삭제"}
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
        </>
      )}
      </>
      )}

      {deleteRequestDoc && (
        <ApproverPickerModal
          isSubmitting={busyId === deleteRequestDoc.id}
          onConfirm={handleRequestDelete}
          onCancel={() => setDeleteRequestDoc(null)}
        />
      )}

      {resubmitDoc && (
        <ApproverPickerModal
          isSubmitting={busyId === resubmitDoc.id}
          onConfirm={handleResubmit}
          onCancel={() => setResubmitDoc(null)}
        />
      )}

      {popbillInfoTarget && (
        <PopbillRequiredInfoModal
          clientName={popbillInfoTarget.client_name}
          missing={popbillInfoTarget.missing}
          values={popbillInfoTarget.values}
          isSubmitting={busyId === popbillInfoTarget.doc.id}
          onConfirm={(info) => issuePopbill(popbillInfoTarget.doc, info)}
          onCancel={() => setPopbillInfoTarget(null)}
        />
      )}

      {proposalDetail && (
        <ProposalDetailModal
          proposal={proposalDetail}
          isBusy={busyId === proposalDetail.id}
          onClose={() => setProposalDetail(null)}
          onApprove={handleProposalApprove}
          onReject={handleProposalReject}
          onDownload={handleProposalDownload}
          onPrint={handleProposalPrint}
          onDeleted={() => {
            setProposalDetail(null);
            reloadAll();
          }}
          onAttachmentsChanged={(updated) => {
            setProposalDetail(updated);
            setProposals((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          }}
        />
      )}

      {detailDoc && (
        <ProjectDocumentDetailModal
          doc={detailDoc}
          isBusy={busyId === detailDoc.id}
          onClose={() => {
          setDetailDoc(null);
          onModalClose?.();
        }}
          onApprove={handleApprove}
          onReject={handleReject}
          onDownload={handleDownload}
          onDownloadExcel={handleDownloadExcel}
          onPrint={handlePrint}
          onSend={handleSend}
          onPopbillIssue={handlePopbillIssue}
          onPopbillView={handlePopbillView}
          onPopbillPdf={handlePopbillPdf}
          onEdit={(d) => {
            logDebug("ProjectDocuments", `${PROJECT_DOC_TYPE_LABELS[d.doc_type]} 수정 진입: doc_id=${d.id}, status=${d.status}`);
            navigate(`/project-documents/new?type=${d.doc_type}&edit=${d.id}`);
          }}
        />
      )}
    </>
  );

  if (embedded || modalOnly) return content;

  const layoutTitle = lockedDocType ? PROJECT_DOC_TYPE_LABELS[lockedDocType] : "문서관리";
  const layoutDescription =
    lockedDocType === "tax_invoice"
      ? "세금계산서를 작성·등록하고 결재합니다. 받은 세금계산서는 사진을 올리면 내용이 자동 입력됩니다."
      : "프로젝트별 견적서·거래명세서를 작성하고 관리합니다.";

  return (
    <MainLayout
      title={layoutTitle}
      description={layoutDescription}
      actions={
        lockedDocType === "tax_invoice" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHometax(true)}
              className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface"
            >
              <FileSpreadsheet size={14} />
              홈택스 엑셀 가져오기
            </button>
            <button
              onClick={handleExportTaxInvoicesExcel}
              disabled={isExportingExcel}
              className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface disabled:opacity-50"
            >
              <Download size={14} />
              {isExportingExcel ? "다운로드 중..." : "엑셀 다운로드 (청구/영수/개요)"}
            </button>
            <Link
              to="/project-documents/new?type=tax_invoice"
              className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} />
              새 세금계산서 작성
            </Link>
          </div>
        ) : undefined
      }
    >
      {content}
      {showHometax && <HometaxImportModal onClose={() => setShowHometax(false)} onImported={loadDocs} />}
    </MainLayout>
  );
}
