import { FileSpreadsheet, Image, ImagePlus, Printer, Trash2 } from "lucide-react";
import { useRef } from "react";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { openFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { AccountName } from "./AccountName";
import { PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS, PAYMENT_TYPE_STYLES, PROOF_TYPE_LABELS, paymentMethodDetailLabel, type Payment } from "./types";
import { usePaymentAccounts } from "./paymentAccounts";

interface PaymentsTableProps {
  payments: Payment[];
  onSelect: (payment: Payment) => void;
  onPrint: (id: number) => void;
  onDownloadExcel: (payment: Payment) => void;
  onDelete: (id: number) => void;
  /** 나중에 영수증 사진을 올린다 (영수증이 없는 지출 줄) */
  onAttachReceipt: (payment: Payment, file: File) => void;
}

// 입출금 내역 표. 행을 누르면 상세, 오른쪽 아이콘으로 영수증·전표 인쇄·엑셀·삭제.
export function PaymentsTable({ payments, onSelect, onPrint, onDownloadExcel, onDelete, onAttachReceipt }: PaymentsTableProps) {
  const pickers = useRef(new Map<number, HTMLInputElement>());
  const { cardName, bankName } = usePaymentAccounts();
  const names = { cardName, bankName };
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
      {/* 표 스타일: 가로선 없이 연한 세로선 + 줄무늬 (첫 열 앞, 버튼 열 앞은 선 제외) */}
      <table className="w-full min-w-[760px] table-fixed text-sm [&_th:not(:first-child):not(:last-child)]:border-l [&_th:not(:first-child):not(:last-child)]:border-text/[0.07] [&_td:not(:first-child):not(:last-child)]:border-l [&_td:not(:first-child):not(:last-child)]:border-text/[0.07]">
        {/* 칸 너비는 화면 폭에 대한 비율이라 화면을 확대해 공간이 줄어도 칸이 함께 줄어든다. 내용 칸은 좁게 잡고(남는 폭),
            날짜·증빙발행·수단 칸을 넉넉히 둔다. 글자가 칸보다 길면 잘리지 않고 줄바꿈한다 (내용만 3줄까지 보이고 나머지는 ... 로 줄인다). */}
        <colgroup>
          <col style={{ width: "5%" }} />
          <col style={{ width: "11.5%" }} />
          <col style={{ width: "9%" }} />
          <col />
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "10.5%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "7.5rem" }} /> {/* 영수증·인쇄·엑셀·삭제 아이콘 4개가 겹치지 않게 고정 폭 */}
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
              <td className="text-center py-2.5 px-2 break-words">
                {p.payment_date}
                {p.occurred_date && (
                  <span className="block text-xs text-text-muted">
                    {p.type === "deposit" ? "미수금" : "미지급금"} 발생 {p.occurred_date}
                  </span>
                )}
              </td>
              <td className="text-center py-2.5 px-2 break-words">{p.category}</td>
              <td className="text-center py-2.5 px-3">
                <div className="line-clamp-3 break-words" title={p.description}>
                  {p.description}
                </div>
              </td>
              <td
                className="text-center py-2.5 px-2 break-words"
                title={p.client_name ?? undefined}
              >
                {p.client_name ?? <span className="text-text-muted">-</span>}
              </td>
              <td className="text-center py-2.5 px-2 break-words">
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
              <td className="text-center py-2.5 px-2 break-words">
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
                <div className="flex flex-wrap items-center justify-end gap-x-0.5">
                  {/* 영수증이 아직 없는 지출은 나중에 올릴 수 있다: 아이콘을 눌러 사진을 고르거나, 이 줄 위로 사진을 끌어다 놓는다 */}
                  {!p.has_receipt && p.type === "withdrawal" && (
                    <>
                      <input
                        ref={(el) => {
                          if (el) pickers.current.set(p.id, el);
                          else pickers.current.delete(p.id);
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        aria-label={`${p.description} 영수증 파일`}
                        className="hidden"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) onAttachReceipt(p, file);
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          pickers.current.get(p.id)?.click();
                        }}
                        className="p-1.5 text-tile-orange-fg hover:text-primary"
                        title="영수증이 아직 없습니다. 눌러서 올리거나, 이 줄 위로 사진을 끌어다 놓으세요"
                        aria-label="영수증 첨부"
                      >
                        <ImagePlus size={14} />
                      </button>
                    </>
                  )}
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
