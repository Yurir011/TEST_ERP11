import {
  Download,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Plus,
  Receipt,
  ShoppingCart,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { ApprovalEndTitle } from "../../components/approval/ApprovalChainPicker";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiGet, apiPost, downloadFile, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { ProposalsPage } from "../proposals/ProposalsPage";
import { ProposalDetailModal } from "../proposals/ProposalDetailModal";
import type { Proposal } from "../proposals/types";
import { HometaxImportModal } from "../transactions/HometaxImportModal";
import { ApproverPickerModal } from "./ApproverPickerModal";
import { useOpenTarget, type OpenOverlayProps } from "../../lib/useOpenTarget";
import { ProjectDocumentDetailModal } from "./ProjectDocumentDetailModal";
import { ProjectSearchBox } from "./ProjectSearchBox";
import { TaxInvoiceStatsCard } from "./TaxInvoiceStatsCard";
import { PendingApprovalBox } from "./PendingApprovalBox";
import { ProjectDocumentsTable } from "./ProjectDocumentsTable";
import {
  excelFilename,
  filterTaxInvoices,
  type DocListRow,
  itemsTotal,
  pdfFilename,
} from "./documentHelpers";
import { PopbillRequiredInfoModal, type PopbillClientInfo } from "./PopbillRequiredInfoModal";
import {
  PROJECT_DOC_STATUS_LABELS,
  PROJECT_DOC_TYPE_LABELS,
  type ProjectDocType,
  type ProjectDocument,
  type ProjectDocumentStatus,
  type TaxInvoicePurpose,
} from "./types";
import { toLocalISODate } from "../../lib/date";
import { useApprovalActions } from "../../lib/useApprovalActions";
import { useDialog } from "../../components/ui/dialog/useDialog";

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
  const { confirm, notify, notifyError } = useDialog();
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
    if (!(await confirm("이 문서를 삭제할까요?", { okLabel: "삭제", danger: true }))) return;
    try {
      await apiDelete(`/api/project-documents/${id}`);
      reloadAll();
    } catch (err) {
      logError("ProjectDocuments", "삭제 실패", err);
      setError(err instanceof ApiError ? err.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  // 승인된 문서는 바로 삭제할 수 없고, 결재선을 지정해 삭제 결재를 요청한다. 최종 승인되면 삭제된다.
  async function handleDeleteClick(doc: ProjectDocument) {
    if (doc.status !== "approved") {
      handleDelete(doc.id);
      return;
    }
    const issuedNote = doc.popbill_issued
      ? "\n\n※ 팝빌로 이미 발행(국세청 전송)된 세금계산서입니다. 여기서 삭제해도 국세청 발행은 취소되지 않으며, 취소는 수정세금계산서를 별도로 발행해야 합니다."
      : "";
    const ledgerNote = doc.doc_type === "tax_invoice" ? "\n최종 승인되면 연결된 매입매출 내역과 입출금 내역도 함께 삭제됩니다." : "";
    if (
      !(await confirm(`승인된 ${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}는 결재를 거쳐야 삭제됩니다. 삭제 결재를 요청할까요?${ledgerNote}${issuedNote}`, { okLabel: "삭제 결재 요청" }))
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
      notify(isFinalDecision ? "삭제되었습니다." : "삭제 결재 요청이 완료되었습니다. 최종 승인되면 삭제됩니다.");
    } catch (err) {
      logError("ProjectDocuments", "삭제 결재 요청 실패", err);
      setDeleteRequestDoc(null);
      setError(err instanceof ApiError ? err.message : "삭제 결재 요청 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  const { approve: handleApprove, reject: handleReject } = useApprovalActions<ProjectDocument>({
    module: "ProjectDocuments",
    getId: (doc) => doc.id,
    basePath: (id) => `/api/project-documents/${id}`,
    confirmApprove: (doc) =>
      doc.delete_requested
        ? `"${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}"의 삭제 요청을 승인하시겠습니까? 최종 승인되면 문서가 삭제됩니다.`
        : `"${PROJECT_DOC_TYPE_LABELS[doc.doc_type]}" 문서를 결재 승인하시겠습니까? 승인 후 PDF에 직인이 찍힙니다.`,
    setBusyId,
    onDone: () => {
      setDetailDoc(null);
      reloadAll();
    },
    onAfter: () => onDecided?.(),
    onError: setError,
  });

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
        notifyError("등록된 거래처 담당자 이메일이 없습니다. 다운로드된 PDF를 직접 첨부해 발송해주세요.");
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
      notifyError(err instanceof ApiError ? err.message : "발행 정보를 확인하는 중 오류가 발생했습니다.");
      return;
    } finally {
      setBusyId(null);
    }
    await issuePopbill(doc);
  }

  async function issuePopbill(doc: ProjectDocument, info?: PopbillClientInfo) {
    if (!(await confirm("이 세금계산서를 팝빌로 발행하시겠습니까? 발행 즉시 국세청에 전송되며, 이후에는 취소(수정발행)만 가능합니다.", { okLabel: "발행" }))) {
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
      notifyError(err instanceof ApiError ? err.message : "팝빌 발행 중 오류가 발생했습니다.");
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
      notifyError(err instanceof ApiError ? err.message : "팝빌 문서를 여는 중 오류가 발생했습니다.");
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
      notifyError(err instanceof ApiError ? err.message : "팝빌 PDF를 여는 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  const { approve: handleProposalApprove, reject: handleProposalReject } = useApprovalActions<Proposal>({
    module: "ProjectDocuments",
    getId: (p) => p.id,
    basePath: (id) => `/api/proposals/${id}`,
    confirmApprove: (p) => `"${p.title}" 품의서를 결재 승인하시겠습니까?`,
    setBusyId,
    onDone: () => {
      setProposalDetail(null);
      reloadAll();
    },
    onError: setError,
  });

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

  const newDocCardCount = visibleActions.length + (lockedDocType ? 0 : 1);
  const newDocGridCols = newDocCardCount >= 4 ? "grid-cols-4" : newDocCardCount === 3 ? "grid-cols-3" : newDocCardCount === 2 ? "grid-cols-2" : "grid-cols-1";

  const now = new Date();

  // 검색창 자동완성 목록: 최근 1년 안에 발행일이 있는 문서의 프로젝트명 (중복 제거, 가나다순).
  const oneYearAgo = toLocalISODate(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  const recentProjectNames = Array.from(
    new Set((docs ?? []).filter((d) => d.issue_date >= oneYearAgo && d.project_name).map((d) => d.project_name))
  ).sort((x, y) => x.localeCompare(y, "ko"));

  // 세금계산서 목록은 청구/영수 구분, 상태, 자유 검색으로 다방면 조회가 가능해야 한다.
  const visibleDocs =
    docs === null
      ? null
      : lockedDocType !== "tax_invoice"
        ? docs
        : filterTaxInvoices(docs, {
            paper: paperFilter,
            direction: directionFilter,
            purpose: purposeFilter,
            status: statusFilter,
            issued: issuedFilter,
            month: monthFilter,
            dateFrom,
            dateTo,
            query: searchQuery,
          });

  // 표에 그릴 행: 전체 탭이면 문서와 품의서를 발행일 최신순으로 섞고, 그 외 탭은 문서만 그대로 쓴다.
  const mergedRows: DocListRow[] | null =
    visibleDocs === null
      ? null
      : (() => {
          const rows: DocListRow[] = visibleDocs.map((doc): DocListRow => ({ kind: "doc", doc }));
          if (lockedDocType || tab !== "all") return rows;
          const all: DocListRow[] = [...rows, ...proposals.map((proposal): DocListRow => ({ kind: "proposal", proposal }))];
          const dateOf = (r: DocListRow) => (r.kind === "doc" ? r.doc.issue_date : r.proposal.issue_date);
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
        <PendingApprovalBox docs={pendingForMe} busyId={busyId} onApprove={handleApprove} onReject={handleReject} />
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
        <ProjectDocumentsTable
          rows={mergedRows}
          lockedDocType={lockedDocType}
          userId={user?.id}
          busyId={busyId}
          onOpenDoc={setDetailDoc}
          onOpenProposal={setProposalDetail}
          onResubmit={setResubmitDoc}
          onDownload={handleDownload}
          onDownloadExcel={handleDownloadExcel}
          onPrint={handlePrint}
          onSend={handleSend}
          onDelete={handleDeleteClick}
          onProposalDownload={handleProposalDownload}
          onProposalPrint={handleProposalPrint}
        />
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
