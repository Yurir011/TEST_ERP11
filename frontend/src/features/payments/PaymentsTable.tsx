import { FileSpreadsheet, Image, Printer, Trash2 } from "lucide-react";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { openFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { AccountName } from "./AccountName";
import { PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS, PAYMENT_TYPE_STYLES, PROOF_TYPE_LABELS, paymentMethodDetailLabel, type Payment } from "./types";
import { usePaymentAccounts } from "./paymentAccounts";

// 너비가 고정된 칸에서 글자가 길면 폰트 크기를 줄여 한 줄에 맞춘다 (글자 수 기준).
function fitFontClass(length: number): string {
  if (length <= 13) return "text-sm";
  if (length <= 16) return "text-xs";
  return "text-[11px]";
}

interface PaymentsTableProps {
  payments: Payment[];
  onSelect: (payment: Payment) => void;
  onPrint: (id: number) => void;
  onDownloadExcel: (payment: Payment) => void;
  onDelete: (id: number) => void;
}

// 입출금 내역 표. 행을 누르면 상세, 오른쪽 아이콘으로 영수증·전표 인쇄·엑셀·삭제.
export function PaymentsTable({ payments, onSelect, onPrint, onDownloadExcel, onDelete }: PaymentsTableProps) {
  const { cardName, bankName } = usePaymentAccounts();
  const names = { cardName, bankName };
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
      {/* 표 스타일: 가로선 없이 연한 세로선 + 줄무늬 (첫 열 앞, 버튼 열 앞은 선 제외) */}
      <table className="w-full table-fixed text-sm [&_th:not(:first-child):not(:last-child)]:border-l [&_th:not(:first-child):not(:last-child)]:border-text/[0.07] [&_td:not(:first-child):not(:last-child)]:border-l [&_td:not(:first-child):not(:last-child)]:border-text/[0.07]">
        {/* 너비 고정: 내용 칸만 남는 폭을 차지하고 줄바꿈된다. 나머지 칸은 글자가 길면 폰트 크기를 줄여 맞춘다. */}
        <colgroup>
          <col className="w-[4.5rem]" />
          <col className="w-[8.5rem]" />
          <col className="w-[8.5rem]" />
          <col />
          <col className="w-[12rem]" />
          <col className="w-[12rem]" />
          <col className="w-[6rem]" />
          <col className="w-[7.5rem]" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="text-center text-text-muted border-b border-border">
            <th className="py-2.5 px-2 font-medium whitespace-nowrap">구분</th>
            <th className="py-2.5 px-2 font-medium whitespace-nowrap">날짜</th>
            <th className="py-2.5 px-2 font-medium whitespace-nowrap">분류</th>
            <th className="py-2.5 px-4 font-medium">내용</th>
            <th className="py-2.5 px-2 font-medium whitespace-nowrap">거래처</th>
            <th className="py-2.5 px-2 font-medium whitespace-nowrap">수단</th>
            <th className="py-2.5 px-2 font-medium whitespace-nowrap">증빙발행</th>
            <th className="py-2.5 px-4 font-medium text-center whitespace-nowrap border-r border-text/[0.07]">금액</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr
              key={p.id}
              onClick={() => onSelect(p)}
              className="cursor-pointer hover:bg-primary/10 even:bg-text/[0.025] transition-colors"
            >
              <td className="text-center py-2.5 px-2 whitespace-nowrap">
                <span className={`text-xs px-2 py-1 font-medium ${PAYMENT_TYPE_STYLES[p.type]}`}>{PAYMENT_TYPE_LABELS[p.type]}</span>
              </td>
              <td className="text-center py-2.5 px-2">
                {p.payment_date}
                {p.occurred_date && (
                  <span className="block text-xs text-text-muted">
                    {p.type === "deposit" ? "미수금" : "미지급금"} 발생 {p.occurred_date}
                  </span>
                )}
              </td>
              <td className={`text-center py-2.5 px-2 whitespace-nowrap overflow-hidden ${fitFontClass(p.category.length)}`}>{p.category}</td>
              <td className="text-center py-2.5 px-4 break-words">{p.description}</td>
              <td
                className={`text-center py-2.5 px-2 whitespace-nowrap overflow-hidden text-ellipsis ${fitFontClass((p.client_name ?? "").length)}`}
                title={p.client_name ?? undefined}
              >
                {p.client_name ?? <span className="text-text-muted">-</span>}
              </td>
              <td
                className={`text-center py-2.5 px-2 whitespace-nowrap overflow-hidden ${fitFontClass(paymentMethodDetailLabel(p, names).length + (p.card_pending ? 5 : 0))}`}
              >
                {p.method === "corporate_card" && p.card_type ? (
                  <>
                    {PAYMENT_METHOD_LABELS[p.method]} (<AccountName kind="card" code={p.card_type} />)
                  </>
                ) : p.method === "bank_transfer" && p.bank_type ? (
                  <>
                    {PAYMENT_METHOD_LABELS[p.method]} (<AccountName kind="bank" code={p.bank_type} />)
                  </>
                ) : (
                  paymentMethodDetailLabel(p, names)
                )}
                {p.card_pending && <span className={`ml-1 text-[11px] px-1.5 py-0.5 font-medium ${SOFT_BADGE.orange}`}>결제예정</span>}
              </td>
              <td className="text-center py-2.5 px-2 whitespace-nowrap overflow-hidden">
                {p.proof_type ? (
                  <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.purple}`}>
                    {p.proof_type === "other" && p.proof_type_detail ? p.proof_type_detail : PROOF_TYPE_LABELS[p.proof_type]}
                  </span>
                ) : p.method === "bank_transfer" || p.method === "cash" ? (
                  <span className="text-xs text-text-muted">미발행</span>
                ) : (
                  <span className="text-xs text-text-muted">-</span>
                )}
              </td>
              <td className="py-2.5 px-4 text-right font-medium whitespace-nowrap border-r border-text/[0.07]">{formatCurrency(p.amount)}</td>
              <td className="py-2.5 px-2">
                <div className="flex items-center justify-end gap-1">
                  {p.has_receipt && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openFile(`/api/payments/${p.id}/receipt`);
                      }}
                      className="p-1.5 text-text-muted hover:text-text"
                      title="영수증 보기"
                    >
                      <Image size={14} />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPrint(p.id);
                    }}
                    className="p-1.5 text-text-muted hover:text-primary"
                    title="전표 인쇄"
                  >
                    <Printer size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownloadExcel(p);
                    }}
                    className="p-1.5 text-text-muted hover:text-primary"
                    title="엑셀 다운로드"
                  >
                    <FileSpreadsheet size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(p.id);
                    }}
                    className="p-1.5 text-text-muted hover:text-danger"
                    title="삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
