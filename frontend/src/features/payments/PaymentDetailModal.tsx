import { FileSpreadsheet, Image, Printer, X } from "lucide-react";
import { downloadFile, openFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logError } from "../../lib/logger";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_STYLES,
  PROOF_TYPE_LABELS,
  type Payment,
} from "./types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs text-text-muted shrink-0">{label}</span>
      <span className="text-sm text-right break-words">{value}</span>
    </div>
  );
}

export function PaymentDetailModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const proofText = payment.proof_type
    ? payment.proof_type === "other" && payment.proof_type_detail
      ? payment.proof_type_detail
      : PROOF_TYPE_LABELS[payment.proof_type]
    : payment.method === "bank_transfer"
      ? "미발행"
      : "-";

  async function handlePrint() {
    try {
      await openFile(`/api/payments/${payment.id}/pdf`);
    } catch (err) {
      logError("Payments", "전표 인쇄 열기 실패", err);
    }
  }

  async function handleDownloadExcel() {
    try {
      await downloadFile(`/api/payments/${payment.id}/excel`, `${PAYMENT_TYPE_LABELS[payment.type]}전표_${payment.payment_date}.xlsx`);
    } catch (err) {
      logError("Payments", "전표 엑셀 다운로드 실패", err);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${PAYMENT_TYPE_STYLES[payment.type]}`}>
              {PAYMENT_TYPE_LABELS[payment.type]}
            </span>
            <h3 className="text-sm font-semibold mt-2">
              {payment.category} · {payment.description}
            </h3>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text shrink-0">
            <X size={18} />
          </button>
        </div>

        <div>
          <Row label="날짜" value={payment.payment_date} />
          <Row label="금액" value={formatCurrency(payment.amount)} />
          <Row label="결제수단" value={PAYMENT_METHOD_LABELS[payment.method]} />
          <Row label="거래처" value={payment.client_name ?? "-"} />
          <Row label="증빙발행" value={proofText} />
          <Row label="메모" value={payment.memo ?? "-"} />
        </div>

        <div className="flex items-center gap-2 mt-5">
          {payment.has_receipt && (
            <button
              onClick={() => openFile(`/api/payments/${payment.id}/receipt`)}
              className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg"
            >
              <Image size={14} />
              영수증 보기
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg"
          >
            <Printer size={14} />
            인쇄
          </button>
          <button
            onClick={handleDownloadExcel}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg"
          >
            <FileSpreadsheet size={14} />
            엑셀 다운로드
          </button>
          <button
            onClick={onClose}
            className="ml-auto text-xs text-text-muted hover:text-text px-3 py-2"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
