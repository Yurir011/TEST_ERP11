import { Download, Eye, Mail, Printer, Send, Sheet, X } from "lucide-react";
import {
  DOC_CURRENCY_SYMBOLS,
  PROJECT_DOC_STATUS_LABELS,
  PROJECT_DOC_STATUS_STYLES,
  PROJECT_DOC_TYPE_LABELS,
  type ProjectDocument,
} from "./types";

function itemsTotal(doc: ProjectDocument): number {
  return doc.items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
}

function formatDocAmount(doc: ProjectDocument, amount: number): string {
  return `${DOC_CURRENCY_SYMBOLS[doc.currency]}${amount.toLocaleString()}`;
}

export function ProjectDocumentDetailModal({
  doc,
  isBusy,
  onClose,
  onDownload,
  onDownloadExcel,
  onPrint,
  onSend,
  onPopbillIssue,
  onPopbillView,
  onPopbillPdf,
}: {
  doc: ProjectDocument;
  isBusy: boolean;
  onClose: () => void;
  onDownload: (doc: ProjectDocument) => void;
  onDownloadExcel: (doc: ProjectDocument) => void;
  onPrint: (doc: ProjectDocument) => void;
  onSend: (doc: ProjectDocument) => void;
  onPopbillIssue: (doc: ProjectDocument) => void;
  onPopbillView: (doc: ProjectDocument) => void;
  onPopbillPdf: (doc: ProjectDocument) => void;
}) {
  const approved = doc.status === "approved" && doc.has_pdf;
  const disabledTitle = "결재 승인 후 이용 가능합니다.";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">
              {PROJECT_DOC_TYPE_LABELS[doc.doc_type]} · {doc.project_name}
            </h3>
            <p className="text-xs text-text-muted mt-1">
              {doc.client_name} · {doc.issue_date}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${PROJECT_DOC_STATUS_STYLES[doc.status]}`}
          >
            {PROJECT_DOC_STATUS_LABELS[doc.status]}
          </span>
          {doc.approver_name && (
            <span className="text-xs text-text-muted">결재권자: {doc.approver_name}</span>
          )}
          {doc.reviewed_at && (
            <span className="text-xs text-text-muted">· {doc.reviewed_at.slice(0, 10)}</span>
          )}
          {doc.doc_type === "tax_invoice" && (
            <span className="text-xs text-text-muted">· 작성목적: {doc.purpose_type}</span>
          )}
        </div>

        {doc.status === "rejected" && doc.reject_reason && (
          <p className="text-xs text-danger bg-red-50 rounded-lg px-3 py-2 mb-4">반려 사유: {doc.reject_reason}</p>
        )}

        {doc.manager_name && <p className="text-xs text-text-muted mb-2">담당자: {doc.manager_name}</p>}

        <div className="bg-bg rounded-xl overflow-hidden mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2 px-3 font-medium">내용</th>
                <th className="py-2 px-3 font-medium text-right">수량</th>
                <th className="py-2 px-3 font-medium text-right">단가</th>
                <th className="py-2 px-3 font-medium text-right">금액</th>
                <th className="py-2 px-3 font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2 px-3">{item.content}</td>
                  <td className="py-2 px-3 text-right">{item.quantity.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right">{formatDocAmount(doc, item.unit_price)}</td>
                  <td className="py-2 px-3 text-right">{formatDocAmount(doc, item.quantity * item.unit_price)}</td>
                  <td className="py-2 px-3">{item.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-right text-sm font-semibold mb-4">합계 {formatDocAmount(doc, itemsTotal(doc))}</p>

        {doc.doc_type === "tax_invoice" && (
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

        <div className="flex items-center gap-2">
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
      </div>
    </div>
  );
}
