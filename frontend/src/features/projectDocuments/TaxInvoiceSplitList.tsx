import { Trash2 } from "lucide-react";
import { ClampText } from "../../components/ui/ClampText";
import { CODE_BADGE } from "../../components/ui/softBadge";
import { vatAmount } from "../../lib/money";
import { itemsSummary, itemsTotal } from "./documentHelpers";
import { ExtraBadges } from "./ProjectDocumentsTable";
import { PROJECT_DOC_STATUS_LABELS, PROJECT_DOC_STATUS_STYLES, type ProjectDocument } from "./types";

interface TaxInvoiceSplitListProps {
  /** 조회 조건이 적용된 세금계산서 (매입·매출이 섞여 있다) */
  docs: ProjectDocument[];
  userId: number | undefined;
  onOpenDoc: (doc: ProjectDocument) => void;
  onResubmit: (doc: ProjectDocument) => void;
  onDelete: (doc: ProjectDocument) => void;
}

const isPurchase = (doc: ProjectDocument) => doc.direction === "purchase" || doc.is_paper;

/** 부가세를 더한 합계(원화 문서만 의미가 있다). */
const grossOf = (doc: ProjectDocument) => {
  const supply = itemsTotal(doc);
  return supply + vatAmount(supply);
};

function sumKrw(docs: ProjectDocument[]) {
  const krw = docs.filter((d) => d.currency === "KRW");
  const supply = krw.reduce((s, d) => s + itemsTotal(d), 0);
  const vat = krw.reduce((s, d) => s + vatAmount(itemsTotal(d)), 0);
  return { supply, vat, gross: supply + vat, foreign: docs.length - krw.length };
}

const TH = "py-2.5 px-3 font-semibold text-white text-center whitespace-nowrap";

function Pane({
  title,
  tone,
  docs,
  userId,
  onOpenDoc,
  onResubmit,
  onDelete,
}: { title: string; tone: "purchase" | "sales"; docs: ProjectDocument[] } & Omit<TaxInvoiceSplitListProps, "docs">) {
  const total = sumKrw(docs);
  const amountColor = tone === "purchase" ? "text-[#8b2942]" : "text-success";
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden min-w-0" data-testid={`tax-pane-${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 font-medium ${tone === "purchase" ? CODE_BADGE.orange : CODE_BADGE.purple}`}>{tone === "purchase" ? "매입" : "매출"}</span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <p className="text-xs text-text-muted">
          {docs.length}건 · 합계 <span className="text-sm font-semibold text-text">₩{total.gross.toLocaleString()}</span>
          {total.foreign > 0 && ` (외화 ${total.foreign}건 제외)`}
        </p>
      </div>
      <div className="overflow-x-auto">
        {/* 날짜·금액은 길이가 비슷해 폭을 고정하고, 거래처명과 품목이 남는 폭을 나눠 쓴다 */}
        <table className="w-full table-fixed min-w-[26rem] text-sm [&_th:not(:first-child)]:border-l [&_th:not(:first-child)]:border-white/20 [&_td:not(:first-child)]:border-l [&_td:not(:first-child)]:border-text/[0.07]">
          <colgroup>
            <col style={{ width: "6.25rem" }} />
            <col style={{ width: "34%" }} />
            <col style={{ width: "7.5rem" }} />
            <col />
            <col style={{ width: "5rem" }} />
          </colgroup>
          <thead>
            <tr className="bg-[#6a7eb3] border-b border-[#5a6ea3]">
              <th className={TH}>날짜</th>
              <th className={TH}>거래처</th>
              <th className={TH}>금액</th>
              <th className={TH}>품목</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-text-muted">
                  조건에 맞는 {tone === "purchase" ? "매입" : "매출"} 세금계산서가 없습니다.
                </td>
              </tr>
            )}
            {docs.map((doc) => (
              <tr key={doc.id} onClick={() => onOpenDoc(doc)} className="cursor-pointer hover:bg-primary/10 even:bg-text/[0.025] transition-colors">
                <td className="py-2.5 px-3 text-center whitespace-nowrap">{doc.issue_date}</td>
                <td className="py-2.5 px-3 max-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1">
                      <ClampText>{doc.client_name}</ClampText>
                    </span>
                    {doc.kind_label ? (
                      <span className={`shrink-0 text-[11px] px-1.5 py-0.5 font-medium ${CODE_BADGE.gray}`}>{doc.kind_label}</span>
                    ) : doc.is_paper ? (
                      <span className={`shrink-0 text-[11px] px-1.5 py-0.5 font-medium ${CODE_BADGE.gray}`}>종이</span>
                    ) : null}
                    {/* 승인 전인 건만 상태를 붙인다 (승인된 건은 표시하지 않는다) */}
                    {doc.status !== "approved" && (
                      <span className={`shrink-0 text-[11px] px-1.5 py-0.5 font-medium ${PROJECT_DOC_STATUS_STYLES[doc.status]}`} title={doc.status === "rejected" ? doc.reject_reason ?? undefined : undefined}>
                        {PROJECT_DOC_STATUS_LABELS[doc.status]}
                      </span>
                    )}
                    {doc.popbill_issued ? (
                      <span className={`shrink-0 text-[11px] px-1.5 py-0.5 font-medium ${CODE_BADGE.green}`} title={`국세청 승인번호 ${doc.popbill_nts_confirm_num}`}>
                        발행
                      </span>
                    ) : !isPurchase(doc) && doc.status === "approved" && !doc.delete_requested ? (
                      <span className={`shrink-0 text-[11px] px-1.5 py-0.5 font-medium ${CODE_BADGE.pink}`} title="승인되었으나 아직 팝빌로 발행하지 않았습니다.">
                        발행 대기
                      </span>
                    ) : null}
                    <ExtraBadges isFinal={doc.is_final_decision && doc.status === "approved"} deleteRequested={doc.delete_requested} />
                  </div>
                </td>
                <td className={`py-2.5 px-3 text-right font-semibold whitespace-nowrap ${amountColor}`}>
                  {doc.currency === "KRW" ? grossOf(doc).toLocaleString() : `${doc.currency} ${itemsTotal(doc).toLocaleString()}`}
                </td>
                <td className="py-2.5 px-3 max-w-0 text-text-muted">
                  <ClampText>{itemsSummary(doc)}</ClampText>
                </td>
                <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {(doc.status === "rejected" || doc.status === "draft") && doc.created_by === userId && (
                      <button onClick={() => onResubmit(doc)} className="text-xs text-primary hover:opacity-80 border border-primary/30 rounded-lg px-1.5 py-1 whitespace-nowrap shrink-0">
                        재요청
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(doc)}
                      disabled={doc.delete_requested}
                      title={doc.delete_requested ? "삭제 결재가 진행 중입니다." : doc.status === "approved" ? "삭제 결재 요청" : "삭제"}
                      className="p-1.5 text-text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
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
    </div>
  );
}

/** 세금계산서 목록: 왼쪽 매입, 오른쪽 매출 2단. 위에 매출·매입 합계와 부가세 차액, 결재 대기 건수를 보여 준다. */
export function TaxInvoiceSplitList({ docs, userId, onOpenDoc, onResubmit, onDelete }: TaxInvoiceSplitListProps) {
  const purchase = docs.filter(isPurchase);
  const sales = docs.filter((d) => !isPurchase(d));
  const p = sumKrw(purchase);
  const s = sumKrw(sales);
  const pending = docs.filter((d) => d.status === "pending").length;
  const cell = "bg-surface border border-border rounded-xl px-4 py-3";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={cell}>
          <p className="text-[11px] text-text-muted">매출 합계 ({sales.length}건)</p>
          <p className="text-base font-semibold tabular-nums">₩{s.gross.toLocaleString()}</p>
        </div>
        <div className={cell}>
          <p className="text-[11px] text-text-muted">매입 합계 ({purchase.length}건)</p>
          <p className="text-base font-semibold tabular-nums">₩{p.gross.toLocaleString()}</p>
        </div>
        <div className={cell}>
          <p className="text-[11px] text-text-muted">매출 부가세 − 매입 부가세</p>
          <p className="text-base font-semibold tabular-nums text-primary">₩{(s.vat - p.vat).toLocaleString()}</p>
        </div>
        <div className={cell}>
          <p className="text-[11px] text-text-muted">결재 대기</p>
          <p className="text-base font-semibold tabular-nums">{pending}건</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 items-start">
        <Pane title="받은 세금계산서" tone="purchase" docs={purchase} userId={userId} onOpenDoc={onOpenDoc} onResubmit={onResubmit} onDelete={onDelete} />
        <Pane title="발행한 세금계산서" tone="sales" docs={sales} userId={userId} onOpenDoc={onOpenDoc} onResubmit={onResubmit} onDelete={onDelete} />
      </div>
    </div>
  );
}
