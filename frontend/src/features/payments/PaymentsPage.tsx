import { ChevronLeft, ChevronRight, Image, Plus, Trash2, Upload, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiDelete, apiGet, apiUpload, openFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_STYLES,
  type CsvImportResult,
  type Payment,
  type PaymentReport,
  type PaymentType,
} from "./types";

const TABS: { key: PaymentType | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "deposit", label: "입금" },
  { key: "withdrawal", label: "출금" },
];

function toMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function PaymentsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<PaymentType | "all">("all");

  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [report, setReport] = useState<PaymentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadPayments() {
    logDebug("Payments", `목록 조회: ${year}-${month}, type=${tab}`);
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (tab !== "all") params.set("type", tab);
    apiGet<Payment[]>(`/api/payments?${params.toString()}`)
      .then(setPayments)
      .catch((err) => {
        logError("Payments", "목록 조회 실패", err);
        setError("입출금 내역을 불러오지 못했습니다.");
      });
  }

  function loadReport() {
    apiGet<PaymentReport>(`/api/payments/report/monthly?year=${year}&month=${month}`)
      .then(setReport)
      .catch((err) => logError("Payments", "월별 리포트 조회 실패", err));
  }

  useEffect(() => {
    loadPayments();
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
    if (!window.confirm("이 입출금 내역을 삭제할까요?")) return;
    try {
      await apiDelete(`/api/payments/${id}`);
      loadPayments();
      loadReport();
    } catch (err) {
      logError("Payments", "삭제 실패", err);
    }
  }

  async function handleCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const result = await apiUpload<CsvImportResult>("/api/payments/import-csv", file);
      setImportResult(result);
      loadPayments();
      loadReport();
    } catch (err) {
      logError("Payments", "CSV 가져오기 실패", err);
      setError(err instanceof ApiError ? err.message : "CSV 가져오기 중 오류가 발생했습니다.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <MainLayout
      title="입출금관리"
      description="법인카드·계좌 입출금 내역을 관리합니다."
      actions={
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvSelected} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface disabled:opacity-50"
          >
            <Upload size={14} />
            {isImporting ? "가져오는 중..." : "법인카드 CSV 가져오기"}
          </button>
          <Link
            to="/payments/new"
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            새 입출금 등록
          </Link>
        </div>
      }
    >
      {importResult && (
        <div className="bg-tile-blue text-tile-blue-fg rounded-xl px-4 py-3 text-sm mb-4">
          {importResult.imported}건 가져옴, {importResult.skipped}건 건너뜀
          {importResult.errors.length > 0 && (
            <ul className="mt-1 text-xs list-disc list-inside">
              {importResult.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

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
            <p className="text-sm text-text-muted">총 입금</p>
            <p className="text-lg font-semibold mt-1 text-success">{formatCurrency(report.total_deposit)}</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text-muted">총 출금</p>
            <p className="text-lg font-semibold mt-1 text-danger">{formatCurrency(report.total_withdrawal)}</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text-muted">순증감</p>
            <p className={`text-lg font-semibold mt-1 ${report.net >= 0 ? "text-success" : "text-danger"}`}>
              {formatCurrency(report.net)}
            </p>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {payments !== null && payments.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <Wallet className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">해당 월의 입출금 내역이 없습니다.</p>
        </div>
      )}

      {payments !== null && payments.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2.5 px-4 font-medium">구분</th>
                <th className="py-2.5 px-4 font-medium">날짜</th>
                <th className="py-2.5 px-4 font-medium">분류</th>
                <th className="py-2.5 px-4 font-medium">내용</th>
                <th className="py-2.5 px-4 font-medium">수단</th>
                <th className="py-2.5 px-4 font-medium text-right">금액</th>
                <th className="py-2.5 px-4 font-medium w-10">영수증</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${PAYMENT_TYPE_STYLES[p.type]}`}>
                      {PAYMENT_TYPE_LABELS[p.type]}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">{p.payment_date}</td>
                  <td className="py-2.5 px-4">{p.category}</td>
                  <td className="py-2.5 px-4">
                    {p.description}
                    {p.client_name && <span className="text-text-muted"> · {p.client_name}</span>}
                  </td>
                  <td className="py-2.5 px-4">{PAYMENT_METHOD_LABELS[p.method]}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{formatCurrency(p.amount)}</td>
                  <td className="py-2.5 px-4">
                    {p.has_receipt && (
                      <button onClick={() => openFile(`/api/payments/${p.id}/receipt`)} className="text-text-muted hover:text-text">
                        <Image size={15} />
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 text-text-muted hover:text-danger">
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
