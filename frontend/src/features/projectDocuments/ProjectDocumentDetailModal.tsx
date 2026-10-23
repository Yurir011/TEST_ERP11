import { ApprovalNote, ApprovalStampBox } from "../../components/approval/ApprovalStamps";
import { Check, Download, Eye, Mail, Pencil, Printer, Send, Sheet, X } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "../../context/useAuth";
import { koreanNumber } from "../../lib/korean";
import { lineAmount } from "../../lib/money";
import { DocumentMailHistory } from "../mail/DocumentMailHistory";
import { formatDocAmount, itemsSummary, itemsTotal } from "./documentHelpers";
import { PurchaseOrderAttachments } from "./PurchaseOrderAttachments";
import { TaxInvoiceImages } from "./TaxInvoiceImages";
import {
  PROJECT_DOC_TYPE_LABELS,
  type ProjectDocType,
  type ProjectDocument,
} from "./types";

// 문서 표: 품의서 상세와 같은 규칙 (라벨 칸은 연회색·가운데, 바깥 테두리는 진하게)
const TABLE = "w-full border-collapse text-[13px] outline outline-1 -outline-offset-1 outline-[#b4b3b9]";
const TH = "border border-border bg-bg px-3 py-3 text-center align-middle text-xs font-semibold text-text-muted whitespace-nowrap w-20";
const TD = "border border-border px-3 py-3 align-top";
const DATE_LABELS: Record<ProjectDocType, string> = { quotation: "견적일", statement: "거래일", purchase_order: "발주일", tax_invoice: "작성일" };
const OWN_LABELS: Record<ProjectDocType, string> = { quotation: "공급자", statement: "공급자", purchase_order: "발주자", tax_invoice: "당사" };

export function ProjectDocumentDetailModal({
  doc,
  isBusy,
  onClose,
  onApprove,
  onReject,
  onDownload,
  onDownloadExcel,
  onPrint,
  onSend,
  onPopbillIssue,
  onPopbillView,
  onPopbillPdf,
  onEdit,
  paymentSlot,
}: {
  doc: ProjectDocument;
  isBusy: boolean;
  onClose: () => void;
  onApprove: (doc: ProjectDocument) => void;
  onReject: (doc: ProjectDocument) => void;
  onDownload: (doc: ProjectDocument) => void;
  onDownloadExcel: (doc: ProjectDocument) => void;
  onPrint: (doc: ProjectDocument) => void;
  onSend: (doc: ProjectDocument) => void;
  onPopbillIssue: (doc: ProjectDocument) => void;
  onPopbillView: (doc: ProjectDocument) => void;
  onPopbillPdf: (doc: ProjectDocument) => void;
  onEdit: (doc: ProjectDocument) => void;
  /** 아래 오른쪽에 놓을 영역 (발주서의 결제 내역) */
  paymentSlot?: ReactNode;
}) {
  const { user } = useAuth();
  const currentStep = doc.steps.find((st) => st.step_order === doc.current_step);
  const canDecide = doc.status === "pending" && currentStep?.approver_id === user?.id;
  const approved = doc.status === "approved" && doc.has_pdf;
  const disabledTitle = "결재 승인 후 이용 가능합니다.";
  // 작성자는 결재 대기 중이 아니고 삭제 결재가 진행 중이 아니면 수정할 수 있다. 승인된 문서는 수정 후 결재를 다시 받아야 한다.
  // 세금계산서는 팝빌로 발행한 뒤에는 수정할 수 없고, 견적서와 거래명세서를 함께 작성한 문서 쌍은 수정할 수 없다 (삭제 후 다시 작성).
  const canEdit =
    doc.created_by === user?.id &&
    doc.status !== "pending" &&
    !doc.delete_requested &&
    !doc.popbill_issued &&
    (doc.doc_type === "tax_invoice" || doc.set_id === null);

  const historyInput = {
    creatorName: doc.creator_name,
    createdAt: doc.created_at,
    summary: `${itemsSummary(doc)} · 합계 ${formatDocAmount(doc, itemsTotal(doc))}`,
    steps: doc.steps,
    currentStep: doc.current_step,
    status: doc.status,
    finalDecision: doc.is_final_decision,
    rejectReason: doc.reject_reason,
    deleteRequested: doc.delete_requested,
    decidedAt: doc.reviewed_at,
  };
  const total = itemsTotal(doc);
  const totalHangul = doc.currency === "KRW" ? koreanNumber(total) : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="relative bg-surface rounded-2xl p-6 pb-10 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} aria-label="닫기" className="absolute right-4 top-4 text-text-muted hover:text-text">
          <X size={20} />
        </button>

        {/* 인쇄된 문서 모양 (품의서 상세와 같은 틀): 왼쪽 위 문서번호·작성일자, 오른쪽 위 결재칸, 가운데 제목 */}
        <div className="flex items-start justify-between gap-4 pr-8">
          <div className="text-xs leading-relaxed text-text-muted">
            {doc.doc_no && <p>No. {doc.doc_no}</p>}
            <p>작성일자 {doc.issue_date}</p>
          </div>
          <ApprovalStampBox {...historyInput} />
        </div>

        <h3 className="my-4 text-center text-xl font-extrabold tracking-[0.3em]">{PROJECT_DOC_TYPE_LABELS[doc.doc_type]}</h3>

        <div className="mb-3 empty:hidden">
          <ApprovalNote {...historyInput} />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <table className={TABLE}>
            <tbody>
              <tr>
                <th scope="row" className={TH}>{doc.doc_type === "tax_invoice" ? "거래처" : "수신"}</th>
                <td className={TD}>
                  <b>{doc.client_name}</b>
                  {doc.doc_type !== "tax_invoice" && " 귀하"}
                </td>
              </tr>
              <tr>
                <th scope="row" className={TH}>제목</th>
                <td className={TD}>{doc.project_name}</td>
              </tr>
              <tr>
                <th scope="row" className={TH}>{DATE_LABELS[doc.doc_type]}</th>
                <td className={`${TD} tabular-nums`}>{doc.issue_date}</td>
              </tr>
            </tbody>
          </table>
          <table className={TABLE}>
            <tbody>
              <tr>
                <th scope="row" className={TH}>{OWN_LABELS[doc.doc_type]}</th>
                <td className={TD}>
                  <b>BENCH</b>
                </td>
              </tr>
              <tr>
                <th scope="row" className={TH}>담당자</th>
                <td className={TD}>{doc.manager_name || "-"}</td>
              </tr>
              <tr>
                <th scope="row" className={TH}>{doc.doc_type === "tax_invoice" ? "작성목적" : "작성자"}</th>
                <td className={TD}>{doc.doc_type === "tax_invoice" ? doc.purpose_type : doc.creator_name}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-y border-[#b4b3b9] px-1 py-3">
          <span className="text-xs font-semibold text-text-muted">합계금액</span>
          {totalHangul && <span className="text-sm font-semibold">일금 {totalHangul} 원정</span>}
          <span className="text-xl font-extrabold tabular-nums">{formatDocAmount(doc, total)}</span>
        </div>

        <div className="mb-12 overflow-x-auto">
          <table className={`${TABLE} min-w-[32rem]`}>
            <thead>
              <tr>
                <th className={`${TH} !w-11`}>No</th>
                <th className={TH}>내용</th>
                <th className={`${TH} text-right`}>수량</th>
                <th className={`${TH} text-right`}>단가</th>
                <th className={`${TH} text-right`}>금액</th>
                <th className={TH}>비고</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((item, i) => (
                <tr key={item.id}>
                  <td className={`${TD} text-center tabular-nums`}>{i + 1}</td>
                  <td className={TD}>{item.content}</td>
                  <td className={`${TD} text-right tabular-nums`}>{item.quantity.toLocaleString()}</td>
                  <td className={`${TD} text-right tabular-nums`}>{formatDocAmount(doc, item.unit_price)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{formatDocAmount(doc, lineAmount(item.quantity, item.unit_price))}</td>
                  <td className={TD}>{item.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {doc.remark && (
          <p className="mb-8 -mt-8 whitespace-pre-wrap text-xs text-text-muted">
            <span className="font-semibold">REMARK</span> {doc.remark}
          </p>
        )}

        {doc.delete_requested && (
          <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2 mb-4">
            이 문서는 삭제 결재가 진행 중입니다. 최종 승인되면 삭제되고, 반려되면 기존 승인 상태로 유지됩니다.
          </p>
        )}

        {doc.doc_type === "tax_invoice" && <TaxInvoiceImages doc={doc} />}
        {doc.doc_type === "purchase_order" && <PurchaseOrderAttachments doc={doc} />}

        {doc.doc_type === "tax_invoice" && doc.direction !== "purchase" && (
          <div className="mb-4">
            {doc.popbill_issued ? (
              <div className="bg-tile-green rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-tile-green-fg">
                  팝빌 발행 완료 · 국세청 승인번호 {doc.popbill_nts_confirm_num}
                </p>
                {doc.popbill_issued_at && (
                  <p className="text-[11px] text-text-muted mt-0.5">발행일시 {doc.popbill_issued_at.slice(0, 16).replace("T", " ")}</p>
                )}
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    onClick={() => onPopbillView(doc)}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 text-xs border border-tile-green-fg/30 text-tile-green-fg rounded-lg px-3 py-1.5 hover:bg-white/50 disabled:opacity-50"
                  >
                    <Eye size={13} />
                    팝빌에서 보기
                  </button>
                  <button
                    onClick={() => onPopbillPdf(doc)}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 text-xs border border-tile-green-fg/30 text-tile-green-fg rounded-lg px-3 py-1.5 hover:bg-white/50 disabled:opacity-50"
                  >
                    <Download size={13} />
                    팝빌 PDF
                  </button>
                </div>
              </div>
            ) : doc.status === "approved" ? (
              <button
                onClick={() => onPopbillIssue(doc)}
                disabled={isBusy}
                className="flex items-center gap-1.5 text-xs bg-primary hover:bg-primary-hover text-white rounded-lg px-3 py-2 disabled:opacity-50"
              >
                <Send size={13} />
                팝빌로 발행
              </button>
            ) : (
              <p className="text-xs text-text-muted">결재 승인 후 팝빌로 발행할 수 있습니다.</p>
            )}
          </div>
        )}

        {canEdit && (
          <button
            onClick={() => onEdit(doc)}
            disabled={isBusy}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 mb-4 hover:bg-bg disabled:opacity-50"
            title={doc.status === "approved" ? "수정하면 결재를 다시 받아야 합니다." : doc.status === "rejected" ? "수정한 뒤 결재를 다시 요청합니다." : undefined}
          >
            <Pencil size={13} />
            수정{doc.status === "approved" ? " (재결재 필요)" : doc.status === "rejected" ? " 후 재요청" : ""}
          </button>
        )}

        {doc.set_id !== null && (
          <p className="text-xs text-tile-blue-fg bg-tile-blue rounded-lg px-3 py-2 mb-4">
            {doc.doc_type === "quotation" ? "거래명세서" : "견적서"}와 함께 작성된 문서입니다. 한 번의 결재로 두 문서가 같이 승인/반려됩니다.
          </p>
        )}

        <DocumentMailHistory docType="project_document" docId={doc.id} />

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {canDecide && (
            <>
              <button
                onClick={() => onApprove(doc)}
                disabled={isBusy}
                className="flex items-center gap-1.5 text-xs text-success border border-success/30 rounded-lg px-3 py-2 hover:bg-success/10 disabled:opacity-50"
              >
                <Check size={14} />
                승인
              </button>
              <button
                onClick={() => onReject(doc)}
                disabled={isBusy}
                className="flex items-center gap-1.5 text-xs text-danger border border-danger/30 rounded-lg px-3 py-2 hover:bg-danger/10 disabled:opacity-50"
              >
                <X size={14} />
                반려
              </button>
            </>
          )}
          <button
            onClick={() => onDownload(doc)}
            disabled={!approved || isBusy}
            title={approved ? "저장 (PDF)" : disabledTitle}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            PDF
          </button>
          <button
            onClick={() => onDownloadExcel(doc)}
            disabled={!doc.has_excel || isBusy}
            title={doc.has_excel ? "저장 (엑셀)" : disabledTitle}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Sheet size={14} />
            엑셀
          </button>
          <button
            onClick={() => onPrint(doc)}
            disabled={!approved}
            title={approved ? "출력" : disabledTitle}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Printer size={14} />
            출력
          </button>
          <button
            onClick={() => onSend(doc)}
            disabled={!approved || isBusy}
            title={approved ? "이메일 발송" : disabledTitle}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Mail size={14} />
            발송
          </button>
        </div>
        {paymentSlot && <div className="ml-auto w-full sm:w-[380px]">{paymentSlot}</div>}
        </div>
      </div>
    </div>
  );
}
