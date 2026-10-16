import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileSpreadsheet,
  Image,
  Plus,
  Printer,
  Repeat,
  Search,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { Client } from "../clients/types";
import { ApiError, apiDelete, apiGet, apiUpload, downloadFile, openFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { PaymentDetailModal } from "./PaymentDetailModal";
import { RecurringPaymentsModal } from "./RecurringPaymentsModal";
import { CardSettleModal } from "./CardSettleModal";
import { CardPendingDetailModal } from "./CardPendingDetailModal";
import { SettleModal } from "./SettleModal";
import { OutstandingDetailModal } from "./OutstandingDetailModal";
import { remainingAmount, type Transaction } from "../transactions/types";
import {
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_STYLES,
  CARD_TYPE_LABELS,
  PROOF_TYPE_LABELS,
  paymentMethodDetailLabel,
  type CardPendingSummary,
  type CardType,
  type CsvImportResult,
  type Payment,
  type PaymentType,
} from "./types";
import { SOFT_BADGE } from "../../components/ui/softBadge";

// 구분 탭. 카드는 결제수단이 법인카드인 내역(결제예정 포함)만 모아 보며, 카드 출금은 출금 탭에도 함께 나온다.
type PaymentTab = PaymentType | "card" | "all";
const TABS: { key: PaymentTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "deposit", label: "입금" },
  { key: "withdrawal", label: "출금" },
  { key: "card", label: "카드" },
];

// 너비가 고정된 칸에서 글자가 길면 폰트 크기를 줄여 한 줄에 맞춘다 (글자 수 기준).
function fitFontClass(length: number): string {
  if (length <= 9) return "text-sm";
  if (length <= 12) return "text-xs";
  return "text-[11px]";
}

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
  const [tab, setTab] = useState<PaymentTab>("all");
  const [cardFilter, setCardFilter] = useState<"all" | CardType>("all"); // 카드 탭에서 고른 카드 종류

  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [csvCardType, setCsvCardType] = useState<CardType>("bc");
  const [cardPending, setCardPending] = useState<CardPendingSummary[]>([]);
  const [showCardSettle, setShowCardSettle] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [settleTarget, setSettleTarget] = useState<{ kind: "receivable" | "payable"; client: Client } | null>(null);

  const [detailTarget, setDetailTarget] = useState<{ kind: "receivable" | "payable"; client: Client } | null>(null);

  // 미수금/미지급금 현황 기간: all=거래처 전체 잔액, this/last=해당 월에 발생한 미결제 매출·매입
  const [periodMode, setPeriodMode] = useState<"all" | "this" | "last" | "month">("all");
  const outstandingPeriod: "all" | "month" = periodMode === "all" ? "all" : "month";
  // 카드 결제일 전(결제예정) 사용내역. 카드별 합계와 세부 내역에 쓴다.
  const [cardItems, setCardItems] = useState<Payment[]>([]);
  const [cardDetail, setCardDetail] = useState<CardType | null>(null);
  const [periodTx, setPeriodTx] = useState<Transaction[] | null>(null);
  // 발생일 표시용: 아직 결제되지 않은 전체 매출/매입 (매입매출 권한이 없으면 비어 있다)
  const [unsettledTx, setUnsettledTx] = useState<Transaction[]>([]);

  const usingCustomRange = Boolean(dateFrom || dateTo);
  // 카드 탭: 카드 종류별 건수/금액 요약은 선택과 상관없이 전체 카드 기준, 표는 고른 카드만 보여준다.
  const cardTabRows = tab === "card" ? payments ?? [] : [];
  const shownPayments =
    payments !== null && tab === "card" && cardFilter !== "all" ? payments.filter((p) => p.card_type === cardFilter) : payments;


  function buildFilterParams() {
    const params = new URLSearchParams();
    if (tab === "card") params.set("method", "corporate_card");
    else if (tab !== "all") params.set("type", tab);
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

  function loadUnsettledTx() {
    apiGet<Transaction[]>("/api/transactions?settled=false")
      .then(setUnsettledTx)
      .catch((err) => logError("Payments", "미결제 매입매출 조회 실패(발생일 표시 생략)", err));
  }

  function loadClients() {
    logDebug("Payments", "미수금/미지급금 현황용 거래처 목록 조회 시작");
    apiGet<Client[]>("/api/clients")
      .then(setClients)
      .catch((err) => logError("Payments", "거래처 목록 조회 실패", err));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPayments();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, tab, keyword, dateFrom, dateTo]);

  useEffect(() => {
    loadClients();
    loadUnsettledTx();
  }, []);

  function handleSettleSuccess() {
    setSettleTarget(null);
    loadPeriodTx(false);
    loadClients();
    loadUnsettledTx();
    loadPayments();
  }

  // 월별 보기는 화면 상단의 월 선택(year/month)을 그대로 따른다.
  const periodYm = { year, month };

  function selectOutstandingPeriod(key: "all" | "this" | "last" | "month") {
    logDebug("Payments", `받을/나갈 금액 기간 선택: ${key}`);
    if (key === "all" || key === "month") {
      // 월별은 화면 상단의 월 선택을 그대로 따른다.
      setPeriodMode(key);
      return;
    }
    const d = new Date();
    if (key === "last") d.setMonth(d.getMonth() - 1, 1);
    setDateFrom("");
    setDateTo("");
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setPeriodMode(key);
  }

  const nowDate = new Date();
  const lastDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
  const isThisMonth = year === nowDate.getFullYear() && month === nowDate.getMonth() + 1;
  const isLastMonth = year === lastDate.getFullYear() && month === lastDate.getMonth() + 1;
  // 이번달/지난달을 눌렀어도 상단의 월을 직접 바꾸면 "월별" 보기로 바뀐다.
  const activePeriodKey: "all" | "this" | "last" | "month" =
    periodMode === "all" ? "all" : periodMode === "this" && isThisMonth ? "this" : periodMode === "last" && isLastMonth ? "last" : "month";

  function loadPeriodTx(showLoading: boolean) {
    if (outstandingPeriod === "all") {
      setPeriodTx(null);
      return;
    }
    logDebug("Payments", `미수/미지급 월별 조회: ${periodYm.year}-${periodYm.month}`);
    if (showLoading) setPeriodTx(null);
    apiGet<Transaction[]>(`/api/transactions?settled=false&year=${periodYm.year}&month=${periodYm.month}`)
      .then(setPeriodTx)
      .catch((err) => {
        logError("Payments", "미수/미지급 월별 조회 실패", err);
        setPeriodTx([]);
      });
  }

  useEffect(() => {
    loadPeriodTx(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outstandingPeriod, year, month]);

  function buildOutstandingRows(kind: "receivable" | "payable") {
    const txType = kind === "receivable" ? "sales" : "purchase";
    if (outstandingPeriod === "all") {
      // 미결제 매입매출 건이 있으면 그 남은 금액 합계를 기준으로 삼는다 (월별 보기와 같은 기준이라 전체가 항상 월별 이상이 된다).
      // 거래처 잔액이 그보다 크면(건과 무관하게 잔액만 있는 경우) 잔액을 쓴다. 건이 없는 거래처는 잔액이 0보다 클 때만 표시한다.
      const remainingByClient = new Map<number, number>();
      unsettledTx.forEach((t) => {
        if (t.type === txType && t.client_id !== null) {
          remainingByClient.set(t.client_id, (remainingByClient.get(t.client_id) ?? 0) + remainingAmount(t));
        }
      });
      return clients
        .map((client) => {
          const balance = kind === "receivable" ? client.receivable_amount : client.payable_amount;
          return { client, amount: Math.max(balance, remainingByClient.get(client.id) ?? 0), hasTx: remainingByClient.has(client.id) };
        })
        .filter((r) => r.amount > 0 || r.hasTx)
        .map(({ client, amount }) => ({ client, amount }));
    }
    const byClient = new Map<number, number>();
    (periodTx ?? []).forEach((t) => {
      if (t.type === txType && t.client_id !== null) byClient.set(t.client_id, (byClient.get(t.client_id) ?? 0) + remainingAmount(t));
    });
    return clients.filter((c) => byClient.has(c.id)).map((client) => ({ client, amount: byClient.get(client.id) ?? 0 }));
  }
  // 거래처별 미수금/미지급금 발생일(미결제 매출·매입의 거래일). 여러 건이면 가장 이른(최초) 발생일을 표시한다.
  function occurredLabel(kind: "receivable" | "payable", clientId: number) {
    const txType = kind === "receivable" ? "sales" : "purchase";
    const dates = unsettledTx
      .filter((t) => t.type === txType && t.client_id === clientId)
      .map((t) => t.transaction_date)
      .sort();
    if (dates.length === 0) return null;
    return dates[0];
  }
  // 일부만 수금/지급한 거래처는 가장 최근 부분 결제일을 함께 보여준다.
  function partialPaidLabel(kind: "receivable" | "payable", clientId: number) {
    const txType = kind === "receivable" ? "sales" : "purchase";
    const dates = unsettledTx
      .filter((t) => t.type === txType && t.client_id === clientId)
      .flatMap((t) => t.payment_history.map((p) => p.payment_date))
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }

  const receivableRows = buildOutstandingRows("receivable");
  const payableRows = buildOutstandingRows("payable");
  const receivableTotal = receivableRows.reduce((sum, r) => sum + r.amount, 0);
  const payableTotal = payableRows.reduce((sum, r) => sum + r.amount, 0);
  const periodLabel = outstandingPeriod === "all" ? "" : ` (${periodYm.month}월 발생분)`;

  // 카드 결제예정: 월별 보기이면 선택한 달에 사용한 건만, 전체이면 아직 결제 확정 전인 모든 건을 카드별로 합산한다.
  const cardMonthKey = toMonthValue(periodYm.year, periodYm.month);
  const cardItemsInPeriod = cardItems.filter((p) => outstandingPeriod === "all" || p.payment_date.startsWith(cardMonthKey));
  const cardRows = (Object.keys(CARD_TYPE_LABELS) as CardType[])
    .map((cardType) => {
      const mine = cardItemsInPeriod.filter((p) => p.card_type === cardType);
      return { cardType, count: mine.length, amount: mine.reduce((sum, p) => sum + p.amount, 0) };
    })
    .filter((r) => r.count > 0);
  const cardTotal = cardRows.reduce((sum, r) => sum + r.amount, 0);


  function clearFilters() {
    setKeyword("");
    setDateFrom("");
    setDateTo("");
  }

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      const params = buildFilterParams();
      if (tab === "card" && cardFilter !== "all") params.set("card_type", cardFilter);
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
      loadCardPending();
    } catch (err) {
      logError("Payments", "삭제 실패", err);
    }
  }

  function loadCardItems() {
    apiGet<Payment[]>("/api/payments?card_pending=true")
      .then(setCardItems)
      .catch((err) => logError("Payments", "카드 결제예정 내역 조회 실패", err));
  }

  function loadCardPending() {
    loadCardItems();
    apiGet<CardPendingSummary[]>("/api/payments/card-pending")
      .then((data) => {
        logDebug("Payments", `카드 결제예정 ${data.reduce((n, s) => n + s.count, 0)}건`);
        setCardPending(data);
      })
      .catch((err) => logError("Payments", "카드 결제예정 조회 실패", err));
  }

  useEffect(loadCardPending, []);

  async function handleCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const result = await apiUpload<CsvImportResult>(`/api/payments/import-csv?card_type=${csvCardType}`, file);
      setImportResult(result);
      loadPayments();
      loadCardPending();
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
            onClick={() => setShowRecurring(true)}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface"
          >
            <Repeat size={14} />
            정기 자동이체
          </button>
          <button
            onClick={() => setShowCardSettle(true)}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface"
          >
            <CreditCard size={14} />
            카드 결제일 일괄처리
            {cardPending.some((s) => s.count > 0) && (
              <span className={`px-1.5 py-0.5 ${SOFT_BADGE.orange}`}>{cardPending.reduce((n, s) => n + s.count, 0)}</span>
            )}
          </button>
          <select
            value={csvCardType}
            onChange={(e) => setCsvCardType(e.target.value as CardType)}
            className="text-xs border border-border rounded-lg px-2 py-2 bg-surface"
            title="가져올 CSV 명세서의 카드 종류"
          >
            {(Object.keys(CARD_TYPE_LABELS) as CardType[]).map((k) => (
              <option key={k} value={k}>
                {CARD_TYPE_LABELS[k]}카드
              </option>
            ))}
          </select>
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

      <div className="flex items-center justify-end mb-3">
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

      {/* 왼쪽: 미결제 금액 기간(전체/이번달/지난달), 오른쪽: 기간 검색. 한 줄로 두고 항목이 줄바꿈되지 않게 한다. */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit shrink-0">
          {(
            [
              ["all", "전체"],
              ["this", "이번달"],
              ["last", "지난달"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => selectOutstandingPeriod(key)}
              className={`px-4 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                activePeriodKey === key ? "bg-bg font-medium text-text shadow-sm" : "text-text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 min-w-0">
          <div className="relative w-60 min-w-[140px] shrink">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="분류/내용/메모/거래처로 검색"
              className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary bg-surface"
            />
          </div>
          <label className="text-xs text-text-muted whitespace-nowrap shrink-0">기간</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary bg-surface shrink-0"
          />
          <span className="text-text-muted text-sm shrink-0">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary bg-surface shrink-0"
          />
          {(keyword || usingCustomRange) && (
            <button
              onClick={clearFilters}
              title="검색 초기화"
              aria-label="검색 초기화"
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface shrink-0"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-text-muted mb-3">
        {usingCustomRange
          ? "기간 검색 중이라 입출금 목록은 입력한 기간으로 조회됩니다."
          : outstandingPeriod === "all"
            ? "지금까지 쌓인 모든 미결제 금액"
            : `${periodYm.year}년 ${periodYm.month}월에 발생한 미결제 금액 (위의 월 선택을 따릅니다)`}
      </p>

      <section className="grid grid-cols-3 gap-4 mb-6">
        {(
          [
            { kind: "receivable", title: "미수금", empty: "미수금", rows: receivableRows, total: receivableTotal, action: "수금 처리", style: "text-primary border-primary/30 hover:bg-tile-blue", totalClass: "text-success" },
            { kind: "payable", title: "미지급금", empty: "미지급금", rows: payableRows, total: payableTotal, action: "지급 처리", style: "text-danger border-danger/30 hover:bg-red-50", totalClass: "text-notify" },
          ] as const
        ).map((card) => (
          <div key={card.kind} className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="text-sm font-medium">
              {card.title}
              <span className="text-xs font-normal text-text-muted">{periodLabel}</span>
            </h2>
            <p className={`text-[17px] font-semibold tabular-nums mt-1 mb-3 ${card.totalClass}`}>{formatCurrency(card.total)}</p>
            {outstandingPeriod !== "all" && periodTx === null ? (
              <p className="text-sm text-text-muted">불러오는 중...</p>
            ) : card.rows.length === 0 ? (
              <p className="text-sm text-text-muted">{card.empty}이 있는 거래처가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {card.rows.map(({ client: c, amount }) => (
                  <li
                    key={c.id}
                    onClick={() => setDetailTarget({ kind: card.kind, client: c })}
                    title="상세 내역 보기"
                    className="bg-bg rounded-xl px-4 py-3 cursor-pointer hover:bg-border/40 transition-colors"
                  >
                    {/* 두 줄: 윗줄 = 거래처명 ←→ 금액, 아랫줄 = 발생일 ←→ 처리 버튼. 칸 어디를 눌러도 상세가 열리고, 처리 버튼만 별도로 동작한다. */}
                    <div className="flex items-center justify-between gap-2 w-full text-left">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium truncate min-w-0">{c.name}</span>
                        {partialPaidLabel(card.kind, c.id) && (
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${SOFT_BADGE.orange}`}>
                            {card.kind === "receivable" ? "수금" : "지급"}(일부)
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(amount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-xs text-text-muted min-w-0">
                        {occurredLabel(card.kind, c.id) && `${card.title} 발생일 ${occurredLabel(card.kind, c.id)}`}
                        {partialPaidLabel(card.kind, c.id) &&
                          ` · ${card.kind === "receivable" ? "수금" : "지급"}(일부) ${partialPaidLabel(card.kind, c.id)}`}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSettleTarget({ kind: card.kind, client: c });
                        }}
                        className={`text-[11px] font-medium border bg-surface rounded-full px-2.5 py-1 shrink-0 transition-colors ${card.style}`}
                      >
                        {card.action}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <div className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-sm font-medium">
            카드 결제예정
            <span className="text-xs font-normal text-text-muted">{periodLabel}</span>
          </h2>
          <p className="text-[17px] font-semibold tabular-nums mt-1 mb-3 text-notify">{formatCurrency(cardTotal)}</p>
          {cardRows.length === 0 ? (
            <p className="text-sm text-text-muted">결제 예정인 카드 사용내역이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {cardRows.map((r) => (
                <li key={r.cardType}>
                  <button
                    type="button"
                    onClick={() => {
                      logDebug("Payments", `카드 결제예정 상세 열기: card_type=${r.cardType}`);
                      setCardDetail(r.cardType);
                    }}
                    title="세부 사용내역 보기"
                    className="w-full flex items-center justify-between gap-2 bg-bg rounded-xl px-4 py-3 text-left hover:opacity-70"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{CARD_TYPE_LABELS[r.cardType]}카드</span>
                      <span className="block text-xs text-text-muted mt-0.5">{r.count}건</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(r.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit mb-4">
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

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {tab === "card" && payments !== null && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 mb-4">
          {(
            [
              { key: "all", label: "전체 카드", rows: cardTabRows },
              ...(Object.keys(CARD_TYPE_LABELS) as CardType[]).map((ct) => ({
                key: ct,
                label: CARD_TYPE_LABELS[ct],
                rows: cardTabRows.filter((p) => p.card_type === ct),
              })),
            ] as { key: "all" | CardType; label: string; rows: Payment[] }[]
          ).map((box) => (
            <button
              key={box.key}
              type="button"
              onClick={() => setCardFilter(box.key)}
              className={`flex items-baseline justify-between gap-3 text-left rounded-xl border px-4 py-2.5 transition-colors ${
                cardFilter === box.key ? "border-primary bg-tile-blue" : "border-border bg-surface hover:border-primary/40"
              }`}
            >
              <span className="text-sm min-w-0 truncate">
                {box.label} <span className="text-xs text-text-muted">· {box.rows.length}건</span>
              </span>
              <span className="text-base font-semibold tabular-nums shrink-0">
                {formatCurrency(box.rows.reduce((sum, p) => sum + p.amount, 0))}
              </span>
            </button>
          ))}
        </div>
      )}

      {shownPayments !== null && shownPayments.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <Wallet className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">
            {keyword || usingCustomRange ? "검색 조건에 맞는 내역이 없습니다." : "해당 월의 입출금 내역이 없습니다."}
          </p>
        </div>
      )}

      {shownPayments !== null && shownPayments.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          {/* 표 스타일: 가로선 없이 연한 세로선 + 줄무늬 (첫 열 앞, 버튼 열 앞은 선 제외) */}
          <table className="w-full table-fixed text-sm [&_th:not(:first-child):not(:last-child)]:border-l [&_th:not(:first-child):not(:last-child)]:border-text/[0.07] [&_td:not(:first-child):not(:last-child)]:border-l [&_td:not(:first-child):not(:last-child)]:border-text/[0.07]">
            {/* 너비 고정: 내용 칸만 남는 폭을 차지하고 줄바꿈된다. 나머지 칸은 글자가 길면 폰트 크기를 줄여 맞춘다. */}
            <colgroup>
              <col className="w-[4.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[6.5rem]" />
              <col />
              <col className="w-[9rem]" />
              <col className="w-[9rem]" />
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
                <th className="py-2.5 px-4 font-medium text-right whitespace-nowrap border-r border-text/[0.07]">금액</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shownPayments.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPayment(p)}
                  className="cursor-pointer hover:bg-primary/10 even:bg-text/[0.025] transition-colors"
                >
                  <td className="text-center py-2.5 px-2 whitespace-nowrap">
                    <span className={`text-xs px-2 py-1 font-medium ${PAYMENT_TYPE_STYLES[p.type]}`}>
                      {PAYMENT_TYPE_LABELS[p.type]}
                    </span>
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
                    className={`text-center py-2.5 px-2 whitespace-nowrap overflow-hidden ${fitFontClass(paymentMethodDetailLabel(p).length + (p.card_pending ? 5 : 0))}`}
                  >
                    {paymentMethodDetailLabel(p)}
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

      {showCardSettle && (
        <CardSettleModal
          summaries={cardPending}
          onClose={() => setShowCardSettle(false)}
          onSuccess={() => {
            loadPayments();
            loadCardPending();
          }}
        />
      )}

      {showRecurring && (
        <RecurringPaymentsModal
          onClose={() => setShowRecurring(false)}
          onChanged={() => {
            loadPayments();
          }}
        />
      )}

      {cardDetail && (
        <CardPendingDetailModal
          cardType={cardDetail}
          items={cardItemsInPeriod.filter((p) => p.card_type === cardDetail)}
          periodLabel={outstandingPeriod === "all" ? "전체" : `${periodYm.year}년 ${periodYm.month}월 사용분`}
          onClose={() => setCardDetail(null)}
        />
      )}

      {selectedPayment && (
        <PaymentDetailModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} />
      )}

      {settleTarget && (
        <SettleModal
          kind={settleTarget.kind}
          client={settleTarget.client}
          occurredLabel={occurredLabel(settleTarget.kind, settleTarget.client.id)}
          // 월별/전체 모두 해당 거래처의 미결제 매입매출에 입력한 금액을 오래된 건부터 배분한다 (전액이 아니면 일부 수금/지급으로 남는다).
          // 연결된 미결제 건이 없을 때(건과 무관하게 잔액만 있는 경우)에는 모달이 거래처 잔액만 줄인다.
          transactions={(outstandingPeriod === "month" ? periodTx ?? [] : unsettledTx).filter(
            (t) => t.client_id === settleTarget.client.id && t.type === (settleTarget.kind === "receivable" ? "sales" : "purchase")
          )}
          onClose={() => setSettleTarget(null)}
          onSuccess={handleSettleSuccess}
        />
      )}

      {detailTarget && (
        <OutstandingDetailModal
          kind={detailTarget.kind}
          client={detailTarget.client}
          period={outstandingPeriod === "all" ? null : periodYm}
          onClose={() => setDetailTarget(null)}
          onSettle={() => {
            setSettleTarget(detailTarget);
            setDetailTarget(null);
          }}
        />
      )}
    </MainLayout>
  );
}
