import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Plus,
  Repeat,
  Search,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { Client } from "../clients/types";
import { ApiError, apiDelete, apiGet, apiUpload, downloadFile, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { PaymentDetailModal } from "./PaymentDetailModal";
import { PaymentAccountsModal } from "./PaymentAccountsModal";
import { RecurringPaymentsModal } from "./RecurringPaymentsModal";
import { useAuth } from "../../context/useAuth";
import { isAdminRole } from "../../lib/auth";
import { CardSettleModal } from "./CardSettleModal";
import { CardPendingDetailModal } from "./CardPendingDetailModal";
import { SettleModal } from "./SettleModal";
import { usePaymentAccounts } from "./paymentAccounts";
import { CardFilterBoxes, type CardFilter } from "./CardFilterBoxes";
import { OutstandingCards } from "./OutstandingCards";
import { PaymentsTable } from "./PaymentsTable";
import { buildOutstandingRows, occurredLabel, partialPaidLabel, type OutstandingKind } from "./outstanding";
import { OutstandingDetailModal } from "./OutstandingDetailModal";
import type { Transaction } from "../transactions/types";
import {
  PAYMENT_TYPE_LABELS,
  type CardPendingSummary,
  type CardType,
  type CsvImportResult,
  type Payment,
  type PaymentType,
} from "./types";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { toMonthValue } from "../../lib/date";
import { useDialog } from "../../components/ui/dialog/useDialog";

// 구분 탭. 카드는 결제수단이 법인카드인 내역(결제예정 포함)만 모아 보며, 카드 출금은 출금 탭에도 함께 나온다.
type PaymentTab = PaymentType | "card" | "all";
const TABS: { key: PaymentTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "deposit", label: "입금" },
  { key: "withdrawal", label: "출금" },
  { key: "card", label: "카드" },
];

function voucherFilename(p: Payment, ext: string) {
  return `${PAYMENT_TYPE_LABELS[p.type]}전표_${p.payment_date}${ext}`;
}

export function PaymentsPage() {
  const { confirm } = useDialog();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<PaymentTab>("all");
  const [cardFilter, setCardFilter] = useState<CardFilter>("all"); // 카드 탭에서 고른 카드 종류

  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const { user } = useAuth();
  const { cards: cardAccounts } = usePaymentAccounts();
  const [csvCardPick, setCsvCardType] = useState<CardType | "">("");
  const csvCardType: CardType = csvCardPick || cardAccounts[0]?.code || "";
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

  const occurredOf = (kind: OutstandingKind, clientId: number) => occurredLabel(kind, clientId, unsettledTx);
  const partialPaidOf = (kind: OutstandingKind, clientId: number) => partialPaidLabel(kind, clientId, unsettledTx);

  const receivableRows = buildOutstandingRows("receivable", outstandingPeriod, clients, unsettledTx, periodTx);
  const payableRows = buildOutstandingRows("payable", outstandingPeriod, clients, unsettledTx, periodTx);
  const receivableTotal = receivableRows.reduce((sum, r) => sum + r.amount, 0);
  const payableTotal = payableRows.reduce((sum, r) => sum + r.amount, 0);
  const periodLabel = outstandingPeriod === "all" ? "" : ` (${periodYm.month}월 발생분)`;

  // 카드 결제예정: 월별 보기이면 선택한 달에 사용한 건만, 전체이면 아직 결제 확정 전인 모든 건을 카드별로 합산한다.
  const cardMonthKey = toMonthValue(periodYm.year, periodYm.month);
  const cardItemsInPeriod = cardItems.filter((p) => outstandingPeriod === "all" || p.payment_date.startsWith(cardMonthKey));
  const cardRows = Array.from(new Set(cardItemsInPeriod.map((p) => p.card_type).filter((c): c is string => !!c)))
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
    if (!(await confirm("이 입출금 내역을 삭제할까요?", { okLabel: "삭제", danger: true }))) return;
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
          {!!user && isAdminRole(user.role) && (
            <button
              onClick={() => setShowAccounts(true)}
              className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface"
            >
              <CreditCard size={14} />
              카드·계좌 관리
            </button>
          )}
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
            {cardAccounts.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nickname}
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

      <OutstandingCards
        receivableRows={receivableRows}
        payableRows={payableRows}
        receivableTotal={receivableTotal}
        payableTotal={payableTotal}
        periodLabel={periodLabel}
        loading={outstandingPeriod !== "all" && periodTx === null}
        cardRows={cardRows}
        cardTotal={cardTotal}
        occurredLabel={occurredOf}
        partialPaidLabel={partialPaidOf}
        onOpenDetail={(kind, client) => setDetailTarget({ kind, client })}
        onSettle={(kind, client) => setSettleTarget({ kind, client })}
        onOpenCardDetail={(cardType) => {
          logDebug("Payments", `카드 결제예정 상세 열기: card_type=${cardType}`);
          setCardDetail(cardType);
        }}
      />

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

      {tab === "card" && payments !== null && <CardFilterBoxes rows={cardTabRows} value={cardFilter} onChange={setCardFilter} />}

      {shownPayments !== null && shownPayments.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <Wallet className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">
            {keyword || usingCustomRange ? "검색 조건에 맞는 내역이 없습니다." : "해당 월의 입출금 내역이 없습니다."}
          </p>
        </div>
      )}

      {shownPayments !== null && shownPayments.length > 0 && (
        <PaymentsTable
          payments={shownPayments}
          onSelect={setSelectedPayment}
          onPrint={handlePrint}
          onDownloadExcel={handleDownloadExcel}
          onDelete={handleDelete}
        />
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

      {showAccounts && <PaymentAccountsModal onClose={() => setShowAccounts(false)} />}
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
          occurredLabel={occurredOf(settleTarget.kind, settleTarget.client.id)}
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
