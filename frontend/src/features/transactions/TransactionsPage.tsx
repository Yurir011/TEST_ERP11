import { ChevronLeft, ChevronRight, Plus, Receipt, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { apiDelete, apiGet } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { TX_TYPE_LABELS, TX_TYPE_STYLES, type Transaction, type TransactionType, type VatReport } from "./types";

const TABS: { key: TransactionType | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "sales", label: "매출" },
  { key: "purchase", label: "매입" },
];

function toMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function TransactionsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<TransactionType | "all">("all");

  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [report, setReport] = useState<VatReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadTransactions() {
    logDebug("Transactions", `목록 조회: ${year}-${month}, type=${tab}`);
    const params = new URLSearchParams({ year: String(year), month: String(month) });
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
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, tab]);

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

  async function handleDelete(id: number) {
    if (!window.confirm("이 거래 내역을 삭제할까요?")) return;
    try {
      await apiDelete(`/api/transactions/${id}`);
      loadTransactions();
      loadReport();
    } catch (err) {
      logError("Transactions", "삭제 실패", err);
    }
  }

  return (
    <MainLayout
      title="매입매출관리"
      description="매입·매출을 기록하고 부가세를 자동으로 집계합니다."
      actions={
        <Link
          to="/transactions/new"
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          새 거래 등록
        </Link>
      }
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                tab === t.key ? "bg-bg font-medium text-text shadow-sm" : "text-text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
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
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text-muted">매출 (공급가액 / 부가세)</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(report.sales_supply)}</p>
            <p className="text-xs text-text-muted mt-0.5">부가세 {formatCurrency(report.sales_vat)}</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text-muted">매입 (공급가액 / 부가세)</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(report.purchase_supply)}</p>
            <p className="text-xs text-text-muted mt-0.5">부가세 {formatCurrency(report.purchase_vat)}</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text-muted">{report.payable_vat >= 0 ? "납부세액" : "환급세액"}</p>
            <p className={`text-lg font-semibold mt-1 ${report.payable_vat >= 0 ? "text-danger" : "text-success"}`}>
              {formatCurrency(Math.abs(report.payable_vat))}
            </p>
            <p className="text-xs text-text-muted mt-0.5">매출부가세 - 매입부가세</p>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {transactions !== null && transactions.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <Receipt className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">해당 월의 거래 내역이 없습니다.</p>
        </div>
      )}

      {transactions !== null && transactions.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
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
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${TX_TYPE_STYLES[tx.type]}`}>
                      {TX_TYPE_LABELS[tx.type]}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">{tx.transaction_date}</td>
                  <td className="py-2.5 px-4">{tx.client_name ?? tx.counterparty ?? "-"}</td>
                  <td className="py-2.5 px-4">{tx.item_name}</td>
                  <td className="py-2.5 px-4 text-right">{formatCurrency(tx.supply_amount)}</td>
                  <td className="py-2.5 px-4 text-right">{formatCurrency(tx.vat_amount)}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{formatCurrency(tx.total_amount)}</td>
                  <td className="py-2.5 px-2">
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
    </MainLayout>
  );
}
