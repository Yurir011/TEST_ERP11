import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Image,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiDelete, apiGet, apiUpload, downloadFile, openFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { PaymentDetailModal } from "./PaymentDetailModal";
import {
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_STYLES,
  PROOF_TYPE_LABELS,
  paymentMethodDetailLabel,
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

function voucherFilename(p: Payment, ext: string) {
  return `${PAYMENT_TYPE_LABELS[p.type]}전표_${p.payment_date}${ext}`;
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
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const usingCustomRange = Boolean(dateFrom || dateTo);

  function buildFilterParams() {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("type", tab);
    if (usingCustomRange) {
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
    } else {
      params.set("year", String(year));
      params.set("month", String(month));
    }
    if (keyword.trim()) params.set("q", keyword.trim());
    return params;
  }

  function loadPayments() {
    const params = buildFilterParams();
    logDebug("Payments", `목록 조회: ${params.toString()}`);
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
    const timer = setTimeout(() => {
      loadPayments();
      loadReport();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, tab, keyword, dateFrom, dateTo]);

  function clearFilters() {
    setKeyword("");
    setDateFrom("");
    setDateTo("");
  }

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      const params = buildFilterParams();
      const filenameRange = usingCustomRange
        ? `${dateFrom || "처음"}~${dateTo || "지금"}`
        : toMonthValue(year, month);
      await downloadFile(`/api/payments/export/excel?${params.toString()}`, `입출금내역_${filenameRange}.xlsx`);
    } catch (err) {
      logError("Payments", "목록 엑셀 다운로드 실패", err);
      setError("목록을 다운로드하지 못했습니다.");
    } finally {
      setIsExporting(false);
    }
  }

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

  async function handlePrint(id: number) {
    try {
      await openFile(`/api/payments/${id}/pdf`);
    } catch (err) {
      logError("Payments", "전표 인쇄 열기 실패", err);
    }
  }

  async function handleDownloadExcel(p: Payment) {
    try {
      await downloadFile(`/api/payments/${p.id}/excel`, voucherFilename(p, ".xlsx"));
    } catch (err) {
      logError("Payments", "전표 엑셀 다운로드 실패", err);
    }
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
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface disabled:opacity-50"
          >
            <Download size={14} />
            {isExporting ? "다운로드 중..." : "목록 엑셀 다운로드"}
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

        <div className={`flex items-center gap-2 ${usingCustomRange ? "opacity-40 pointer-events-none" : ""}`}>
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

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="분류/내용/메모/거래처로 검색"
            className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary bg-surface"
          />
        </div>
        <label className="text-xs text-text-muted">기간</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="text-sm border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary bg-surface"
        />
        <span className="text-text-muted text-sm">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="text-sm border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary bg-surface"
        />
        {(keyword || usingCustomRange) && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text px-2 py-1.5"
          >
            <X size={13} />
            검색 초기화
          </button>
        )}
        {usingCustomRange && (
          <span className="text-xs text-tile-blue-fg bg-tile-blue px-2 py-1 rounded-full">
            기간 검색 중 (월별 보기 대신 적용)
          </span>
        )}
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
          <p className="text-sm text-text-muted">
            {keyword || usingCustomRange ? "검색 조건에 맞는 내역이 없습니다." : "해당 월의 입출금 내역이 없습니다."}
          </p>
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
                <th className="py-2.5 px-4 font-medium">증빙발행</th>
                <th className="py-2.5 px-4 font-medium text-right">금액</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPayment(p)}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-bg/60 transition-colors"
                >
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
                  <td className="py-2.5 px-4">{paymentMethodDetailLabel(p)}</td>
                  <td className="py-2.5 px-4">
                    {p.proof_type ? (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-tile-purple text-tile-purple-fg">
                        {p.proof_type === "other" && p.proof_type_detail ? p.proof_type_detail : PROOF_TYPE_LABELS[p.proof_type]}
                      </span>
                    ) : p.method === "bank_transfer" ? (
                      <span className="text-xs text-text-muted">미발행</span>
                    ) : (
                      <span className="text-xs text-text-muted">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-medium">{formatCurrency(p.amount)}</td>
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
                          handlePrint(p.id);
                        }}
                        className="p-1.5 text-text-muted hover:text-primary"
                        title="전표 인쇄"
                      >
                        <Printer size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadExcel(p);
                        }}
                        className="p-1.5 text-text-muted hover:text-primary"
                        title="엑셀 다운로드"
                      >
                        <FileSpreadsheet size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
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
      )}

      {selectedPayment && (
        <PaymentDetailModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} />
      )}
    </MainLayout>
  );
}
