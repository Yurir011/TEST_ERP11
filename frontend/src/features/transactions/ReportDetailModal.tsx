import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { TX_TYPE_LABELS, TX_TYPE_STYLES, type Transaction, type TransactionType, type VatReport } from "./types";

export type ReportCardKind = TransactionType | "vat";

interface ReportDetailModalProps {
  kind: ReportCardKind;
  report: VatReport;
  onClose: () => void;
}

function sum(list: Transaction[], key: "supply_amount" | "vat_amount" | "total_amount") {
  return list.reduce((acc, t) => acc + t[key], 0);
}

// 부가세 리포트 카드(매출/매입/납부세액)가 집계한 기준월 거래 내역을 보여준다.
export function ReportDetailModal({ kind, report, onClose }: ReportDetailModalProps) {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ year: String(report.year), month: String(report.month) });
    if (kind !== "vat") params.set("type", kind);
    logDebug("Transactions", `리포트 카드 상세 조회 시작: kind=${kind}, ${params.toString()}`);
    apiGet<Transaction[]>(`/api/transactions?${params.toString()}`)
      .then((list) => {
        logDebug("Transactions", `리포트 카드 상세 조회 성공: ${list.length}건`);
        setItems(list);
      })
      .catch((err) => {
        logError("Transactions", "리포트 카드 상세 조회 실패", err);
        setError("상세 내역을 불러오지 못했습니다.");
      });
  }, [kind, report.year, report.month]);

  const title = kind === "sales" ? "매출 내역" : kind === "purchase" ? "매입 내역" : payableTitle(report);
  const groups: TransactionType[] = kind === "vat" ? ["sales", "purchase"] : [kind];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs text-text-muted mt-1">
              {report.year}년 {report.month}월 기준
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text" title="닫기">
            <X size={16} />
          </button>
        </div>

        {kind === "vat" && (
          <div className="bg-bg rounded-xl px-4 py-3 mb-4 text-sm space-y-1">
            <p className="flex justify-between">
              <span className="text-text-muted">매출부가세</span>
              <span className="tabular-nums">{formatCurrency(report.sales_vat)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-text-muted">매입부가세</span>
              <span className="tabular-nums">- {formatCurrency(report.purchase_vat)}</span>
            </p>
            <p className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1.5">
              <span>{report.payable_vat >= 0 ? "납부세액" : "환급세액"}</span>
              <span className="tabular-nums">{formatCurrency(Math.abs(report.payable_vat))}</span>
            </p>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
        {!error && items === null && <p className="text-xs text-text-muted">불러오는 중...</p>}

        {items !== null && (
          <div className="overflow-y-auto space-y-5">
            {groups.map((g) => {
              const rows = items.filter((t) => t.type === g);
              return (
                <div key={g}>
                  <p className="flex items-center justify-between text-xs mb-2">
                    <span className={`px-2 py-1 font-medium ${TX_TYPE_STYLES[g]}`}>
                      {TX_TYPE_LABELS[g]} {rows.length}건
                    </span>
                    <span className="text-text-muted tabular-nums">
                      공급가액 {formatCurrency(sum(rows, "supply_amount"))} · 부가세 {formatCurrency(sum(rows, "vat_amount"))} · 합계{" "}
                      <b className="text-text">{formatCurrency(sum(rows, "total_amount"))}</b>
                    </span>
                  </p>
                  {rows.length === 0 ? (
                    <p className="text-sm text-text-muted px-1">해당 월 {TX_TYPE_LABELS[g]} 내역이 없습니다.</p>
                  ) : (
                    <ul className="space-y-2">
                      {rows.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 bg-bg rounded-xl px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{t.item_name}</p>
                            <p className="text-xs text-text-muted mt-0.5 truncate">
                              {t.transaction_date} · {t.client_name ?? t.counterparty ?? "-"} · {t.settled ? "결제완료" : "미결제"}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm tabular-nums">{formatCurrency(t.total_amount)}</p>
                            <p className="text-xs text-text-muted tabular-nums">부가세 {formatCurrency(t.vat_amount)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function payableTitle(report: VatReport) {
  return report.payable_vat >= 0 ? "납부세액 계산 내역" : "환급세액 계산 내역";
}
