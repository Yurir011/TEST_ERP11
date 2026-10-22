import { ClientCombobox } from "../../components/ui/ClientCombobox";
import { Info } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { ApprovalEndTitle } from "../../components/approval/ApprovalChainPicker";
import { useAuth } from "../../context/useAuth";
import type { Client } from "../clients/types";
import type { Project } from "../projects/types";
import { ProposalReferencePanel } from "../proposals/ProposalReferencePanel";
import { ReferenceProposalPicker } from "../proposals/ReferenceProposalPicker";
import { isPurchaseProposal } from "../proposals/purchaseFlow";
import type { Proposal } from "../proposals/types";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../lib/api";
import { GRADE_LABELS, TITLE_LABELS, hasMenuPermission } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { ApproverPickerModal } from "./ApproverPickerModal";
import { DocumentItemsEditor } from "./DocumentItemsEditor";
import { OTHER_PROJECT, isProjectDocType, projectPayload, scannedCounterparty, toItemFormValues, toItemsPayload } from "./documentForm";
import { PurchaseOrderAttachmentsSection } from "./PurchaseOrderAttachments";
import { QuotationLoader } from "./QuotationLoader";
import { TaxInvoicePhotoSection } from "./TaxInvoicePhotoSection";
import {
  EMPTY_PROJECT_DOC_ITEM,
  MAX_PROJECT_DOC_ITEMS,
  PROJECT_DOC_TYPE_LABELS,
  TAX_INVOICE_PURPOSE_HELP,
  type DocCurrency,
  type ProjectDocType,
  type ProjectDocument,
  type ProjectDocumentItemFormValues,
  type TaxInvoiceOcrResult,
  type TaxInvoicePurpose,
} from "./types";
import { todayISO } from "../../lib/date";
import { useDialog } from "../../components/ui/dialog/useDialog";

const PURPOSE_OPTIONS: TaxInvoicePurpose[] = ["청구", "영수"];

export function ProjectDocumentFormPage() {
  const { notify } = useDialog();
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type");
  // ?type=set 이면 견적서+거래명세서를 같은 내용으로 한 번에 작성하고, 한 번의 결재로 함께 승인/반려된다.
  const isSet = typeParam === "set";
  // ?edit=문서ID 이면 기존 문서를 수정한다. 세금계산서는 팝빌 발행 전이면 승인된 문서도 수정할 수 있고,
  // 견적서/거래명세서는 반려(또는 작성 중)된 문서를 수정할 수 있다. 저장하면 결재를 다시 받아야 한다.
  const editId = searchParams.get("edit");
  // ?proposal=품의서ID 이면 그 구매 품의서에서 발주서를 만든다 (구매 품의서 카드의 발주 버튼).
  const proposalParam = searchParams.get("proposal");
  const isEdit = editId !== null && !isSet && isProjectDocType(typeParam);
  const docType: ProjectDocType = isProjectDocType(typeParam) ? typeParam : "quotation";
  const navigate = useNavigate();
  const { user } = useAuth();
  // 프로젝트 관리 화면에서 들어오면(/projects/:id/documents/new) 그 프로젝트가 미리 선택되고, 작성 후 그 화면으로 돌아간다.
  const { id: routeProjectId } = useParams<{ id: string }>();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [approvedQuotations, setApprovedQuotations] = useState<ProjectDocument[]>([]);
  const [loadedQuotationId, setLoadedQuotationId] = useState("");
  // projectId가 OTHER_PROJECT("기타")이면 프로젝트 없이 projectOtherName에 직접 입력한 내용으로 작성한다.
  const [projectId, setProjectId] = useState(routeProjectId ?? "");
  const [projectOtherName, setProjectOtherName] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [clientName, setClientName] = useState("");
  // 입력한 거래처명과 같은 등록 거래처가 있으면 사업자번호를 입력칸 아래에 함께 보여준다.
  const matchedClient = clients.find((c) => c.name === clientName.trim());
  const [managerName, setManagerName] = useState("");
  const [remark, setRemark] = useState(""); // 발주서 REMARK 칸
  const [sourceProposal, setSourceProposal] = useState<Proposal | null>(null);
  // 근거 품의서를 보면서 작성할 수 있게 하는 참조용 품의서 (새로 쓸 때는 sourceProposal 과 같고, 수정할 때는 연결된 품의서)
  const [referenceProposal, setReferenceProposal] = useState<Proposal | null>(null);
  const [showReference, setShowReference] = useState(false);
  // 품의서와 연결되지 않은 일반 발주서에서 고를 수 있는 승인된 구매 품의서 (참조 전용)
  const [referenceOptions, setReferenceOptions] = useState<Proposal[]>([]);
  const [currency, setCurrency] = useState<DocCurrency>("KRW");
  const [purposeType, setPurposeType] = useState<TaxInvoicePurpose>("청구");
  const [items, setItems] = useState<ProjectDocumentItemFormValues[]>([{ ...EMPTY_PROJECT_DOC_ITEM }]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApproverPicker, setShowApproverPicker] = useState(false);

  // 세금계산서 사진 등록: 올린 사진은 문서 생성 직후 함께 저장하고, 첫 사진은 OCR로 입력란을 자동으로 채운다.
  const [invoiceImages, setInvoiceImages] = useState<File[]>([]);
  // 발주서 파일 첨부: 새로 고른 파일은 문서 저장 직후 올리고, 수정 시 기존 첨부 중 지운 것은 저장할 때 함께 삭제한다.
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [originalAttachments, setOriginalAttachments] = useState<ProjectDocument["images"]>([]);
  const [existingAttachments, setExistingAttachments] = useState<ProjectDocument["images"]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<TaxInvoiceOcrResult | null>(null);
  const [direction, setDirection] = useState<"sales" | "purchase" | null>(null);
  const [isPaper, setIsPaper] = useState(false); // 종이로 받은 매입 세금계산서 (팝빌 등록 대상 아님)
  const [approvalNo, setApprovalNo] = useState<string | null>(null);

  // 세금계산서와 발주서는 새로 쓸 때 담당자를 로그인한 사용자(이름 + 직책, 직책이 없으면 직급)로 자동 입력한다. 이미 입력된 값은 덮어쓰지 않으므로 고칠 수 있다.
  useEffect(() => {
    if ((docType !== "tax_invoice" && docType !== "purchase_order") || !user || isEdit) return;
    const position = user.title ? TITLE_LABELS[user.title] : GRADE_LABELS[user.grade];
    const label = [user.name, position].filter(Boolean).join(" ");
    logDebug("ProjectDocumentForm", `${PROJECT_DOC_TYPE_LABELS[docType]} 담당자 자동입력: ${label}`);
    setManagerName((prev) => prev || label);
    // isEdit 는 화면 진입 시 경로로 정해지는 값이라 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, user]);

  useEffect(() => {
    if (!isEdit) return;
    logDebug("ProjectDocumentForm", `${PROJECT_DOC_TYPE_LABELS[docType]} 수정 불러오기: doc_id=${editId}`);
    apiGet<ProjectDocument[]>(`/api/project-documents?doc_type=${docType}`)
      .then((list) => {
        const target = list.find((d) => String(d.id) === editId);
        if (!target) {
          setError(`수정할 ${PROJECT_DOC_TYPE_LABELS[docType]}를 찾을 수 없습니다.`);
          return;
        }
        if (target.set_id !== null) {
          setError("견적서와 거래명세서를 함께 작성한 문서는 수정할 수 없습니다. 삭제 후 다시 작성해주세요.");
          return;
        }
        if (target.popbill_issued) {
          setError("팝빌로 발행된 세금계산서는 수정할 수 없습니다.");
          return;
        }
        if (target.project_id === null) {
          setProjectId(OTHER_PROJECT);
          setProjectOtherName(target.project_name);
        } else {
          setProjectId(String(target.project_id));
        }
        setIssueDate(target.issue_date);
        setClientName(target.client_name);
        setManagerName(target.manager_name ?? "");
        setRemark(target.remark ?? "");
        setCurrency(target.currency);
        setPurposeType(target.purpose_type);
        setIsPaper(target.is_paper);
        setOriginalAttachments(target.images);
        setExistingAttachments(target.images);
        if (target.doc_type === "purchase_order" && target.proposal_id !== null) {
          // 수정 화면에서도 근거 품의서를 참조할 수 있게 불러온다 (참조 전용이라 저장 동작에는 영향 없음)
          apiGet<Proposal[]>("/api/proposals")
            .then((proposals) => setReferenceProposal(proposals.find((x) => x.id === target.proposal_id) ?? null))
            .catch((err) => logError("ProjectDocumentForm", "참조 품의서 조회 실패", err));
        }
        setItems(toItemFormValues(target.items));
      })
      .catch((err) => {
        logError("ProjectDocumentForm", "수정 불러오기 실패", err);
        setError(`수정할 ${PROJECT_DOC_TYPE_LABELS[docType]}를 불러오지 못했습니다.`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editId]);

  useEffect(() => {
    if (!proposalParam || docType !== "purchase_order" || editId !== null) return;
    logDebug("ProjectDocumentForm", `구매 품의서에서 발주서 작성: proposal_id=${proposalParam}`);
    apiGet<Proposal[]>("/api/proposals")
      .then((list) => {
        const target = list.find((p) => String(p.id) === proposalParam);
        if (!target || !isPurchaseProposal(target) || target.status !== "approved") {
          setError("승인된 구매 품의서에서만 발주서를 만들 수 있습니다.");
          return;
        }
        setSourceProposal(target);
        setReferenceProposal(target);
        // 발주서 하단 REMARK 칸에 근거 품의서 번호를 미리 적어 준다 (비어 있을 때만).
        setRemark((prev) => prev || `품의서 No. ${target.doc_no}`);
        // 품의서에 적은 프로젝트·거래처·통화·금액·내용을 이어받는다 (품목은 제목 한 줄, 수량 1, 단가=금액, 비고=상세 내용 첫 줄. 작성 중 고칠 수 있다).
        setProjectId((prev) => prev || (target.project_id ? String(target.project_id) : OTHER_PROJECT));
        if (!target.project_id) setProjectOtherName((prev) => prev || "일반 구매");
        if (target.vendor_name) setClientName((prev) => prev || target.vendor_name!);
        if (target.currency) setCurrency(target.currency);
        const firstLine = (target.content ?? "").split("\n").find((l) => l.trim())?.trim().slice(0, 100) ?? "";
        setItems((prev) =>
          prev.length === 1 && !prev[0].content && !prev[0].unit_price
            ? [
                {
                  ...EMPTY_PROJECT_DOC_ITEM,
                  content: target.title,
                  quantity: "1",
                  unit_price: target.amount !== null && target.amount !== undefined ? String(target.amount) : "",
                  note: firstLine,
                },
              ]
            : prev,
        );
      })
      .catch((err) => {
        logError("ProjectDocumentForm", "구매 품의서 조회 실패", err);
        setError("구매 품의서를 불러오지 못했습니다.");
      });
    // 화면이 열릴 때 한 번만 조회한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (docType !== "purchase_order" || proposalParam) return;
    apiGet<Proposal[]>("/api/proposals")
      .then((list) =>
        setReferenceOptions(
          list.filter((p) => isPurchaseProposal(p) && p.status === "approved").sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.id - a.id),
        ),
      )
      .catch((err) => logError("ProjectDocumentForm", "참조할 구매 품의서 목록 조회 실패", err));
    // 화면이 열릴 때 한 번만 조회한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiGet<Project[]>("/api/projects")
      .then((list) => setProjects(list.filter((p) => (p.status !== "completed" && p.status !== "discarded") || String(p.id) === routeProjectId)))
      .catch((err) => logError("ProjectDocumentForm", "프로젝트 목록 조회 실패", err));

    logDebug("ProjectDocumentForm", "거래처 목록 조회 시작 (거래처명 자동완성)");
    apiGet<Client[]>("/api/clients")
      .then(setClients)
      .catch((err) => logError("ProjectDocumentForm", "거래처 목록 조회 실패", err));
    // 처음 한 번만 조회한다 (routeProjectId 는 경로 값이라 화면이 열려 있는 동안 바뀌지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (quotation.project_id === null) {
      setProjectId(OTHER_PROJECT);
      setProjectOtherName(quotation.project_name);
    } else {
      setProjectId(String(quotation.project_id));
    }
    setClientName(quotation.client_name);
    setManagerName(quotation.manager_name ?? "");
    setCurrency(quotation.currency);
    setItems(toItemFormValues(quotation.items));
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

  /** 인식 결과를 입력란에 채운다. 사용자가 이어서 확인/수정할 수 있다. */
  function applyOcrResult(r: TaxInvoiceOcrResult) {
    if (r.issue_date) setIssueDate(r.issue_date);
    const counterparty = r.counterparty_name ?? r.recipient.name;
    if (counterparty) setClientName(counterparty);
    setDirection(r.direction);
    setApprovalNo(r.approval_no);
    setPurposeType("청구"); // 받은 세금계산서 등록은 청구 / 미지급으로 처리한다.
    setCurrency("KRW");
    if (r.items.length > 0) {
      setItems(
        r.items.slice(0, MAX_PROJECT_DOC_ITEMS).map((it) => ({
          content: it.content,
          quantity: String(it.quantity),
          unit_price: String(it.unit_price), // 단가는 소수(예: 454,545.5)도 그대로 입력된다
          note: it.spec ?? "",
        }))
      );
    }
  }

  async function handleInvoiceFilesSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    const isFirst = invoiceImages.length === 0;
    setInvoiceImages((prev) => [...prev, ...files]);
    if (!isFirst) return;

    setIsScanning(true);
    try {
      logDebug("ProjectDocumentForm", `세금계산서 사진 인식 요청: filename=${files[0].name}`);
      const result = await apiUpload<TaxInvoiceOcrResult>("/api/project-documents/ocr/tax-invoice", files[0]);
      setScanSummary(result);
      applyOcrResult(result);
      logDebug("ProjectDocumentForm", `세금계산서 사진 인식 성공: direction=${result.direction}, warnings=${result.warnings.length}`);
    } catch (err) {
      logError("ProjectDocumentForm", "세금계산서 사진 인식 실패", err);
      setScanSummary(null);
      setError(err instanceof ApiError ? err.message : "사진 인식 중 오류가 발생했습니다. 직접 입력해주세요.");
    } finally {
      setIsScanning(false);
    }
  }

  function handleAttachFilesSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    logDebug("ProjectDocumentForm", `발주서 첨부 파일 선택: ${files.map((f) => f.name).join(", ")}`);
    setAttachFiles((prev) => [...prev, ...files]);
  }

  /** 발주서 첨부 반영: 지운 기존 파일을 삭제하고 새로 고른 파일을 올린다 (문서 저장이 끝난 뒤 호출) */
  async function syncAttachments(docId: number) {
    const keepIds = new Set(existingAttachments.map((a) => a.id));
    for (const old of originalAttachments.filter((a) => !keepIds.has(a.id))) {
      logDebug("ProjectDocumentForm", `발주서 첨부 삭제: doc_id=${docId}, image_id=${old.id}`);
      await apiDelete(`/api/project-documents/${docId}/images/${old.id}`);
    }
    for (const file of attachFiles) {
      logDebug("ProjectDocumentForm", `발주서 첨부 저장: doc_id=${docId}, filename=${file.name}`);
      await apiUpload(`/api/project-documents/${docId}/images`, file);
    }
  }

  function removeInvoiceImage(index: number) {
    setInvoiceImages((prev) => prev.filter((_, i) => i !== index));
    if (index === 0) {
      // 인식에 사용한 첫 사진을 지우면 자동 판별된 방향/승인번호도 함께 비운다 (입력란 값은 그대로 둔다).
      setScanSummary(null);
      setDirection(null);
      setApprovalNo(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!projectId) {
      setError("관련 프로젝트를 선택해주세요.");
      return;
    }
    if (projectId === OTHER_PROJECT && !projectOtherName.trim()) {
      setError("관련 프로젝트 '기타'의 내용을 입력해주세요.");
      return;
    }
    // 승인된 구매 품의서에서 만드는 발주서는 별도 결재 없이 바로 작성한다 (결재선 선택 창을 띄우지 않는다).
    if (sourceProposal) {
      logDebug("ProjectDocumentForm", `품의서 기반 발주서: 결재선 없이 작성 proposal_id=${sourceProposal.id}`);
      void handleRequestApproval(null, [], true);
      return;
    }
    setShowApproverPicker(true);
  }

  async function handleRequestApproval(endTitle: ApprovalEndTitle | null, approverIds: number[], isFinalDecision: boolean) {
    // 세금계산서는 항상 외상(미수/미지급)으로 매입매출에 기록된다. 입금/출금은 입출금관리에서 매입매출을 불러와 처리한다.
    const received = null;
    setIsSubmitting(true);
    try {
      logDebug("ProjectDocumentForm", `결재요청 시도: end_title=${endTitle}, is_final_decision=${isFinalDecision}, edit=${isEdit}`);
      if (isEdit) {
        await apiPut(`/api/project-documents/${editId}`, {
          update_project: true,
          ...projectPayload(projectId, projectOtherName),
          issue_date: issueDate,
          currency,
          purpose_type: purposeType,
          client_name: clientName,
          manager_name: managerName || null,
          remark: docType === "purchase_order" ? remark.trim() || null : null,
          items: toItemsPayload(items),
          is_paper: isPaper,
          request_approval: true,
          end_title: endTitle,
          approver_ids: approverIds,
          is_final_decision: isFinalDecision,
        });
        if (docType === "purchase_order") await syncAttachments(Number(editId));
        notify("수정 후 결재 요청이 완료되었습니다.");
        navigate(docType === "tax_invoice" ? "/tax-invoices" : "/project-documents", { replace: true });
        return;
      }
      const endpoint = isSet ? "/api/project-documents/set" : "/api/project-documents";
      const createdResult = await apiPost<ProjectDocument | ProjectDocument[]>(endpoint, {
        ...projectPayload(projectId, projectOtherName),
        doc_type: docType,
        proposal_id: docType === "purchase_order" ? (sourceProposal?.id ?? null) : null,
        issue_date: issueDate,
        currency,
        purpose_type: purposeType,
        client_name: clientName,
        manager_name: managerName || null,
        remark: docType === "purchase_order" ? remark.trim() || null : null,
        items: toItemsPayload(items),
        end_title: endTitle,
        approver_ids: approverIds,
        is_final_decision: isFinalDecision,
        received,
        direction: docType === "tax_invoice" ? (isPaper ? "purchase" : direction) : null,
        is_paper: docType === "tax_invoice" ? isPaper : false,
        approval_no: docType === "tax_invoice" ? approvalNo : null,
        // 사진에서 인식한 상대방(우리 회사가 아닌 쪽) 정보 - 거래처관리에 없는 거래처여도 엑셀/PDF 양식을 채우는 데 쓴다.
        counterparty: scannedCounterparty(docType, scanSummary, direction),
      });

      const createdDocs = Array.isArray(createdResult) ? createdResult : [createdResult];
      if (docType === "tax_invoice") {
        for (const file of invoiceImages) {
          logDebug("ProjectDocumentForm", `세금계산서 사진 저장: doc_id=${createdDocs[0].id}, filename=${file.name}`);
          await apiUpload(`/api/project-documents/${createdDocs[0].id}/images`, file);
        }
      }
      if (docType === "purchase_order") await syncAttachments(createdDocs[0].id);
      notify(sourceProposal ? "발주서가 작성되었습니다. 거래처에 보낸 뒤 카드에서 발송 확인을 눌러 주세요." : "결재 요청이 완료되었습니다.");
      // 구매 품의서 카드에서 왔으면 전자결재 화면(카드)으로 돌아간다.
      navigate(
        sourceProposal ? "/approval" : routeProjectId ? `/projects/${routeProjectId}` : docType === "tax_invoice" ? "/tax-invoices" : "/project-documents",
        { replace: true },
      );
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
    <MainLayout
      title={
        isSet
          ? "새 견적서 · 거래명세서 작성"
          : docType === "tax_invoice"
            ? isEdit
              ? "세금계산서 수정"
              : "새 세금계산서 작성 및 등록"
            : isEdit
              ? `${PROJECT_DOC_TYPE_LABELS[docType]} 수정`
              : `새 ${PROJECT_DOC_TYPE_LABELS[docType]} 작성`
      }
    >
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-2xl">
        {docType === "tax_invoice" && (
          <div className="flex items-start gap-2 bg-tile-purple text-tile-purple-fg rounded-xl px-4 py-3 text-xs">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>
              직접 작성하거나, 받은 세금계산서 사진을 올려 내용을 자동으로 등록할 수 있습니다.
            </p>
          </div>
        )}

        {isEdit && docType !== "tax_invoice" && (
          <div className="flex items-start gap-2 bg-tile-orange text-tile-orange-fg rounded-xl px-4 py-3 text-xs">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>{PROJECT_DOC_TYPE_LABELS[docType]}를 수정한 뒤 결재를 다시 요청합니다. 승인된 문서도 수정할 수 있으며 반드시 결재를 다시 받아야 합니다. 저장하면 이전 결재 내역은 초기화되고 선택한 결재권자에게 새로 요청됩니다.</p>
          </div>
        )}

        {isEdit && docType === "tax_invoice" && (
          <div className="flex items-start gap-2 bg-tile-orange text-tile-orange-fg rounded-xl px-4 py-3 text-xs">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>수정한 세금계산서는 결재를 다시 받아야 합니다. 승인되기 전까지는 출력·팝빌 발행을 할 수 없고, 재승인되면 매입매출 내역과, 대금 결제가 끝난 건은 입출금 내역(금액·거래처·입금/출금 구분)도 수정한 내용으로 함께 갱신됩니다. 결제일·결제방법·메모는 그대로 유지됩니다.</p>
          </div>
        )}

        {sourceProposal && (
          <div className="flex items-start gap-2 bg-tile-orange text-tile-orange-fg rounded-xl px-4 py-3 text-xs">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p className="flex-1">
              구매 품의서 <b>No. {sourceProposal.doc_no}</b> ({sourceProposal.title})에 대한 발주서입니다. 품의가 이미 승인되었으므로 별도 결재 없이 바로 작성되고, 품의서 카드에 발주서로 연결됩니다.
            </p>
            <button
              type="button"
              onClick={() => setShowReference((v) => !v)}
              className="shrink-0 rounded-lg border border-tile-orange-fg/40 bg-surface px-2.5 py-1 text-xs font-medium text-text hover:border-primary hover:text-primary"
            >
              {showReference ? "참조 닫기" : "품의서 참조"}
            </button>
          </div>
        )}
        {docType === "purchase_order" && !sourceProposal && !(isEdit && referenceProposal) && referenceOptions.length > 0 && (
          <ReferenceProposalPicker
            options={referenceOptions}
            value={referenceProposal?.id ?? null}
            onChange={(id) => {
              setReferenceProposal(referenceOptions.find((p) => p.id === id) ?? null);
              if (id === null) setShowReference(false);
            }}
            open={showReference}
            onToggle={() => setShowReference((v) => !v)}
          />
        )}
        {!sourceProposal && isEdit && referenceProposal && (
          <div className="flex items-start gap-2 bg-tile-orange text-tile-orange-fg rounded-xl px-4 py-3 text-xs">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p className="flex-1">
              이 발주서는 구매 품의서 <b>No. {referenceProposal.doc_no}</b> ({referenceProposal.title})에서 작성되었습니다.
            </p>
            <button
              type="button"
              onClick={() => setShowReference((v) => !v)}
              className="shrink-0 rounded-lg border border-tile-orange-fg/40 bg-surface px-2.5 py-1 text-xs font-medium text-text hover:border-primary hover:text-primary"
            >
              {showReference ? "참조 닫기" : "품의서 참조"}
            </button>
          </div>
        )}

        {docType === "tax_invoice" && !isEdit && (
          <TaxInvoicePhotoSection
            images={invoiceImages}
            isScanning={isScanning}
            scanSummary={scanSummary}
            onFilesSelect={handleInvoiceFilesSelect}
            onRemove={removeInvoiceImage}
          />
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
          <QuotationLoader quotations={approvedQuotations} value={loadedQuotationId} onChange={handleLoadQuotation} />
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
            <option value={OTHER_PROJECT}>기타 (직접 입력)</option>
            {(() => {
              const loaded = approvedQuotations.find((q) => String(q.id) === loadedQuotationId);
              if (!loaded || loaded.project_id === null || projects.some((p) => p.id === loaded.project_id)) return null;
              return (
                <option value={loaded.project_id}>
                  {loaded.project_name} ({loaded.client_name}) · 완료된 프로젝트
                </option>
              );
            })()}
          </select>
          {projectId === OTHER_PROJECT && (
            <input
              required
              value={projectOtherName}
              onChange={(e) => setProjectOtherName(e.target.value)}
              maxLength={200}
              placeholder="프로젝트 내용을 직접 입력 (예: 샘플 납품, 수리 건)"
              className="w-full mt-2 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          )}
          {projects.length === 0 && (
            <p className="text-xs text-text-muted mt-1.5">진행 중인 프로젝트가 없습니다. 먼저 프로젝트를 등록하거나 '기타'를 선택해주세요.</p>
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
            <ClientCombobox required value={clientName} onChange={setClientName} clients={clients} />
            {matchedClient && (
              <p className="text-[11px] text-text-muted mt-1">
                사업자번호 {matchedClient.biz_reg_no ?? "미등록"}
              </p>
            )}
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

        {docType === "purchase_order" && (
          <div>
            <label className="block text-xs text-text-muted mb-1.5">REMARK (발주서 하단 비고)</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              placeholder="예: 수신견적서: REF No. ID20240102-A02 , 납품처 : 본사 주소지"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-none"
            />
          </div>
        )}

        {docType === "purchase_order" && (
          <PurchaseOrderAttachmentsSection
            docId={editId ? Number(editId) : null}
            files={attachFiles}
            existing={existingAttachments}
            onFilesSelect={handleAttachFilesSelect}
            onRemoveFile={(index) => setAttachFiles((prev) => prev.filter((_, i) => i !== index))}
            onRemoveExisting={(id) => setExistingAttachments((prev) => prev.filter((a) => a.id !== id))}
          />
        )}

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

            <label className="flex items-start gap-2 mt-3 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isPaper}
                onChange={(e) => {
                  logDebug("ProjectDocumentForm", `종이 세금계산서 체크: ${e.target.checked}`);
                  setIsPaper(e.target.checked);
                  setDirection(e.target.checked ? "purchase" : scanSummary?.direction ?? null);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">종이 세금계산서 (매입)</span>
                <span className="block text-[11px] text-text-muted mt-0.5">
                  종이로 받아 팝빌에 등록하지 않는 매입 세금계산서입니다. 목록에서 따로 구분되며 팝빌로 발행하지 않습니다.
                </span>
              </span>
            </label>
          </div>
        )}

        <DocumentItemsEditor
          items={items}
          currency={currency}
          onCurrencyChange={docType !== "tax_invoice" ? setCurrency : null}
          onAdd={addItem}
          onRemove={removeItem}
          onUpdate={updateItem}
        />

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
          >
            {sourceProposal ? "발주서 작성" : "결재요청"}
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

      {showReference && referenceProposal && <ProposalReferencePanel proposal={referenceProposal} onClose={() => setShowReference(false)} />}

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
