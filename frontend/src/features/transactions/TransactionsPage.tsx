import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiDelete, apiGet, downloadFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { HometaxImportModal } from "./HometaxImportModal";
import { ReportDetailModal, type ReportCardKind } from "./ReportDetailModal";
import { TransactionDetailModal } from "./TransactionDetailModal";
import { TransactionSettleModal } from "./TransactionSettleModal";
import { TX_TYPE_LABELS, TX_TYPE_STYLES, type Transaction, type TransactionType, type VatReport } from "./types";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { todayISO, toLocalISODate, toMonthValue } from "../../lib/date";
import { useDialog } from "../../components/ui/dialog/useDialog";

const TABS: { key: TransactionType | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "sales", label: "매출" },
  { key: "purchase", label: "매입" },
];

const PERIOD_PRESETS = [
  { months: 1, label: "1개월" },
  { months: 3, label: "3개월" },
  { months: 6, label: "6개월" },
  { months: 12, label: "12개월" },
];

function monthsAgoISO(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return toLocalISODate(d);
}

export function TransactionsPage() {
  const { confirm, notifyError } = useDialog();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<TransactionType | "all">("all");
  const [statusTab, setStatusTab] = useState<"all" | "unsettled" | "settled">("all");

  const [startDate, setStartDate] = useState(monthsAgoISO(1));
  const [endDate, setEndDate] = useState(todayISO());
  const [activePreset, setActivePreset] = useState<number | null>(1);

  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [showHometax, setShowHometax] = useState(false);
  const [cardDetail, setCardDetail] = useState<ReportCardKind | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null); // 세부 내용을 보고 있는 매입매출
  const [settleTx, setSettleTx] = useState<Transaction | null>(null); // 수금/지급 처리 중인 매입매출
  const [report, setReport] = useState<VatReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const visible = transactions === null ? null : transactions.filter((t) => statusTab === "all" || (statusTab === "settled") === t.settled);
  // 결제 상태 탭에 건수를 보여주기 위한 집계 (현재 매출/매입 탭 기준)
  const statusCounts = {
    all: transactions?.length ?? 0,
    unsettled: transactions?.filter((t) => !t.settled).length ?? 0,
    settled: transactions?.filter((t) => t.settled).length ?? 0,
  };
  const visibleTotal = (visible ?? []).reduce((sum, t) => sum + t.total_amount, 0);

  function loadTransactions() {
    logDebug("Transactions", `목록 조회: ${startDate} ~ ${endDate}, type=${tab}`);
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (tab !== "all") params.set("type", tab);
    apiGet<Transaction[]>(`/api/transactions?${params.toString()}`)
      .then(setTransactions)
      .catch((err) => {
        logError("Transactions", "목록 조회 실패", err);
        setError("거래 내역을 불러오지 못했습니다.");
      });
  }

  function loadReport() {
    apiGet<VatReport>(`/api/transactions/report/vat?year=${year}&month=${month}`)
      .then(setReport)
      .catch((err) => logError("Transactions", "부가세 리포트 조회 실패", err));
  }

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, tab]);

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    setYear(y);
    setMonth(m);
  }

  function applyPreset(months: number) {
    setActivePreset(months);
    setStartDate(monthsAgoISO(months));
    setEndDate(todayISO());
  }

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (tab !== "all") params.set("type", tab);
      await downloadFile(`/api/transactions/export/excel?${params.toString()}`, `매입매출내역_${startDate}~${endDate}.xlsx`);
    } catch (err) {
      logError("Transactions", "목록 엑셀 다운로드 실패", err);
      setError("목록을 다운로드하지 못했습니다.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!(await confirm("이 거래 내역을 삭제할까요?", { okLabel: "삭제", danger: true }))) return;
    try {
      await apiDelete(`/api/transactions/${id}`);
      loadTransactions();
      loadReport();
    } catch (err) {
      logError("Transactions", "삭제 실패", err);
      // 결제한 입출금이 남아 있는 거래 등 서버가 삭제를 거절한 사유를 보여준다
      notifyError(err instanceof ApiError ? err.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  return (
    <MainLayout
      title="매입매출관리"
      description="매입·매출을 기록하고 부가세를 자동으로 집계합니다."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHometax(true)}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface"
          >
            <FileSpreadsheet size={14} />
            홈택스 엑셀 가져오기
          </button>
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface disabled:opacity-50"
          >
            <Download size={14} />
            {isExporting ? "다운로드 중..." : "목록 엑셀 다운로드"}
          </button>
          <Link
            to="/transactions/new"
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            새 거래 등록
          </Link>
        </div>
      }
    >
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">부가세 리포트 기준월</span>
          <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-surface text-text-muted">
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={toMonthValue(year, month)}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              if (y && m) {
                setYear(y);
                setMonth(m);
              }
            }}
            className="text-sm border border-border rounded-lg px-2 py-1 outline-none focus:border-primary bg-surface"
          />
          <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-surface text-text-muted">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {report && (
        <section className="grid grid-cols-3 gap-4 mb-6">
          <button type="button" onClick={() => setCardDetail("sales")} title="상세 내역 보기" className="text-left bg-surface border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors">
            <p className="text-sm text-text-muted">매출 (공급가액 / 부가세)</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(report.sales_supply)}</p>
            <p className="text-xs text-text-muted mt-0.5">부가세 {formatCurrency(report.sales_vat)}</p>
          </button>
          <button type="button" onClick={() => setCardDetail("purchase")} title="상세 내역 보기" className="text-left bg-surface border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors">
            <p className="text-sm text-text-muted">매입 (공급가액 / 부가세)</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(report.purchase_supply)}</p>
            <p className="text-xs text-text-muted mt-0.5">부가세 {formatCurrency(report.purchase_vat)}</p>
          </button>
          <button type="button" onClick={() => setCardDetail("vat")} title="상세 내역 보기" className="text-left bg-surface border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors">
            <p className="text-sm text-text-muted">{report.payable_vat >= 0 ? "납부세액" : "환급세액"}</p>
            <p className={`text-lg font-semibold mt-1 ${report.payable_vat >= 0 ? "text-notify" : "text-success"}`}>
              {formatCurrency(Math.abs(report.payable_vat))}
            </p>
            <p className="text-xs text-text-muted mt-0.5">매출부가세 - 매입부가세</p>
          </button>
        </section>
      )}

      <div className="bg-surface border border-border rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3">
        <span className="text-xs text-text-muted shrink-0">조회 기간</span>
        <div className="flex gap-1">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.months}
              onClick={() => applyPreset(p.months)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                activePreset === p.months
                  ? "border border-primary bg-tile-blue text-tile-blue-fg font-medium"
                  : "border border-border text-text-muted hover:bg-bg"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setActivePreset(null);
            }}
            className="text-sm border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary bg-bg"
          />
          <span className="text-text-muted text-sm">~</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setActivePreset(null);
            }}
            className="text-sm border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary bg-bg"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {/* 목록: 매출/매입 · 결제 구분 탭이 이 표의 머리줄이라 목록 바로 위에 붙어 있고, 건수·합계도 같은 줄에 보인다 */}
      {visible !== null && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-bg border border-border rounded-lg p-1 w-fit">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                  tab === t.key ? "bg-surface font-medium text-text shadow-sm" : "text-text-muted hover:text-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-bg border border-border rounded-lg p-1 w-fit">
            {(
              [
                ["all", "전체"],
                ["unsettled", "미결제"],
                ["settled", "결제완료"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusTab(key)}
                className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                  statusTab === key ? "bg-surface font-medium text-text shadow-sm" : "text-text-muted hover:text-text"
                }`}
              >
                {label} <span className="text-[11px] tabular-nums text-text-muted">{statusCounts[key]}</span>
              </button>
            ))}
          </div>
            </div>
            <span className="text-sm tabular-nums">
              <span className="text-text-muted">{visible.length}건 · </span>
              <b>합계 {formatCurrency(visibleTotal)}</b>
            </span>
          </div>
          {visible.length === 0 ? (
            <div className="p-10 text-center">
              <Receipt className="mx-auto mb-2 text-text-muted" size={24} />
              <p className="text-sm text-text-muted">해당 기간의 거래 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2.5 px-4 font-medium">구분</th>
                <th className="py-2.5 px-4 font-medium">날짜</th>
                <th className="py-2.5 px-4 font-medium">거래처</th>
                <th className="py-2.5 px-4 font-medium">품목</th>
                <th className="py-2.5 px-4 font-medium text-right">공급가액</th>
                <th className="py-2.5 px-4 font-medium text-right">부가세</th>
                <th className="py-2.5 px-4 font-medium text-right">합계</th>
                <th className="py-2.5 px-4 font-medium">결제</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => {
                    logDebug("Transactions", `상세 열기: tx_id=${tx.id}`);
                    setDetailTx(tx);
                  }}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-primary/10 transition-colors"
                >
                  <td className="py-2.5 px-4">
                    <span className={`text-xs px-2 py-1 font-medium ${TX_TYPE_STYLES[tx.type]}`}>
                      {TX_TYPE_LABELS[tx.type]}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">{tx.transaction_date}</td>
                  <td className="py-2.5 px-4">{tx.client_name ?? tx.counterparty ?? "-"}</td>
                  <td className="py-2.5 px-4">{tx.item_name}</td>
                  <td className="py-2.5 px-4 text-right">{formatCurrency(tx.supply_amount)}</td>
                  <td className="py-2.5 px-4 text-right">{formatCurrency(tx.vat_amount)}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{formatCurrency(tx.total_amount)}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {tx.settled ? (
                      <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.green}`}>
                        {tx.type === "sales" ? "입금완료" : "결제완료"}
                        {tx.settled_date ? ` ${tx.settled_date.slice(2).replace(/-/g, ".")}` : ""}
                      </span>
                    ) : (
                      <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.orange}`}>
                        {tx.paid_amount > 0
                          ? tx.type === "sales"
                            ? "수금(일부)"
                            : "지급(일부)"
                          : tx.type === "sales"
                            ? "외상매출"
                            : "외상매입"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Link
                      to={`/transactions/${tx.id}/edit`}
                      aria-label="수정"
                      title="수정"
                      className="inline-block p-1.5 text-text-muted hover:text-primary"
                    >
                      <Pencil size={14} />
                    </Link>
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="p-1.5 text-text-muted hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {detailTx && (
        <TransactionDetailModal
          tx={detailTx}
          onClose={() => setDetailTx(null)}
          onSettle={() => {
            setSettleTx(detailTx);
          }}
        />
      )}

      {settleTx && (
        <TransactionSettleModal
          tx={settleTx}
          onClose={() => setSettleTx(null)}
          onSuccess={() => {
            setSettleTx(null);
            setDetailTx(null);
            loadTransactions();
            loadReport();
          }}
        />
      )}

      {cardDetail && report && <ReportDetailModal kind={cardDetail} report={report} onClose={() => setCardDetail(null)} />}

      {showHometax && (
        <HometaxImportModal
          onClose={() => setShowHometax(false)}
          onImported={() => {
            loadTransactions();
            loadReport();
          }}
        />
      )}
    </MainLayout>
  );
}
