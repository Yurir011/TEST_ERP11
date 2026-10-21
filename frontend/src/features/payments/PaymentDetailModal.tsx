import { FileSpreadsheet, Image, Pencil, Printer, X } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { downloadFile, openFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logError } from "../../lib/logger";
import { AccountName } from "./AccountName";
import { usePaymentAccounts } from "./paymentAccounts";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_STYLES,
  PROOF_TYPE_LABELS,
  paymentMethodDetailLabel,
  type Payment,
} from "./types";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs text-text-muted shrink-0">{label}</span>
      <span className="text-sm text-right break-words">{value}</span>
    </div>
  );
}

export function PaymentDetailModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const navigate = useNavigate();
  const { cardName, bankName } = usePaymentAccounts();
  const proofText = payment.proof_type
    ? payment.proof_type === "other" && payment.proof_type_detail
      ? payment.proof_type_detail
      : PROOF_TYPE_LABELS[payment.proof_type]
    : payment.method === "bank_transfer" || payment.method === "cash"
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
            <span className={`text-xs px-2 py-1 font-medium ${PAYMENT_TYPE_STYLES[payment.type]}`}>
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
          <Row label={payment.type === "deposit" ? "수금일" : "지급일"} value={payment.payment_date} />
          {payment.occurred_date && (
            <Row label={payment.type === "deposit" ? "미수금 발생일" : "미지급금 발생일"} value={payment.occurred_date} />
          )}
          <Row label="금액" value={formatCurrency(payment.amount)} />
          <Row
            label="결제수단"
            value={
              payment.method === "corporate_card" && payment.card_type ? (
                <>
                  {PAYMENT_METHOD_LABELS[payment.method]} (<AccountName kind="card" code={payment.card_type} />)
                </>
              ) : payment.method === "bank_transfer" && payment.bank_type ? (
                <>
                  {PAYMENT_METHOD_LABELS[payment.method]} (<AccountName kind="bank" code={payment.bank_type} />)
                </>
              ) : (
                paymentMethodDetailLabel(payment, { cardName, bankName })
              )
            }
          />
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
            onClick={() => navigate(`/payments/${payment.id}/edit`)}
            className="flex items-center gap-1.5 text-xs bg-primary hover:bg-primary-hover text-white rounded-lg px-3 py-2"
          >
            <Pencil size={14} />
            수정
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
