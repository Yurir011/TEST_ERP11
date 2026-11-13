import { ClipboardPaste, FileText, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { Client } from "../clients/types";
import { ApiError, apiGet, apiPost, apiPut, apiUpload } from "../../lib/api";
import type { TaxInvoiceOcrResult } from "../projectDocuments/types";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { vatAmount as calcVat } from "../../lib/money";
import { TX_TYPE_LABELS, TX_TYPE_STYLES, type TaxInvoiceCandidate, type Transaction, type TransactionType } from "./types";
import { NumberInput } from "../../components/ui/NumberInput";
import { ClientCombobox } from "../../components/ui/ClientCombobox";
import { todayISO } from "../../lib/date";

interface ItemRow {
  name: string;
  quantity: string;
  unitPrice: string;
}
const EMPTY_ROW: ItemRow = { name: "", quantity: "1", unitPrice: "0" };
const MAX_ROWS = 50;
const rowAmount = (r: ItemRow) => (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
const isBlankRow = (r: ItemRow) => r.name.trim() === "" && rowAmount(r) === 0;

/** 저장된 거래를 품목 줄로: 품목 내역이 있으면 그대로, 없으면 품목명 한 줄(수량 1, 단가 = 공급가액) */
function rowsFromTransaction(tx: Pick<Transaction, "items" | "item_name" | "supply_amount">): ItemRow[] {
  if (tx.items && tx.items.length > 0) return tx.items.map((it) => ({ name: it.name, quantity: String(it.quantity), unitPrice: String(it.unit_price) }));
  return [{ name: tx.item_name, quantity: "1", unitPrice: String(tx.supply_amount) }];
}

/** 스크린샷에서 읽은 품목을 줄로. 품목 금액 합계가 읽은 공급가액과 같을 때만 줄별로 쓰고, 아니면 한 줄로 요약한다. */
function rowsFromScan(r: TaxInvoiceOcrResult): ItemRow[] | null {
  const lines = r.items.filter((it) => it.content);
  const supply = r.supply_amount;
  if (lines.length === 0) return supply !== null ? [{ name: "", quantity: "1", unitPrice: String(supply) }] : null;
  const detailed = lines.map((it) => ({ name: it.content, quantity: String(it.quantity || 1), unitPrice: String(it.unit_price || 0) }));
  if (supply === null || detailed.reduce((sum, d) => sum + rowAmount(d), 0) === supply) return detailed;
  const first = lines[0].content;
  return [{ name: lines.length > 1 ? `${first} 외 ${lines.length - 1}건` : first, quantity: "1", unitPrice: String(supply) }];
}

/** 목록에 보이는 품목명: 한 줄이면 그대로, 여러 줄이면 "첫 품목 외 N건" */
function summaryName(rows: ItemRow[]): string {
  const used = rows.filter((r) => !isBlankRow(r));
  const first = (used[0]?.name ?? "").trim();
  return used.length > 1 ? `${first} 외 ${used.length - 1}건` : first;
}

function itemsPayload(rows: ItemRow[]) {
  return rows
    .filter((r) => !isBlankRow(r))
    .map((r) => ({ name: r.name.trim() || "품목", quantity: Math.max(1, Number(r.quantity) || 1), unit_price: Number(r.unitPrice) || 0 }));
}

function TaxInvoicePicker({ onPick, onClose }: { onPick: (c: TaxInvoiceCandidate) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TaxInvoiceCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      logDebug("TransactionForm", `불러올 세금계산서 조회: q=${q}`);
      apiGet<TaxInvoiceCandidate[]>(`/api/transactions/linkable-tax-invoices?q=${encodeURIComponent(q)}`)
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch((err) => {
          logError("TransactionForm", "세금계산서 목록 조회 실패", err);
          setError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">세금계산서 불러오기</h3>
          <button onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">
          아직 매입매출에 연결되지 않은 세금계산서만 보입니다. 선택하면 내용이 입력란에 채워지고, 저장하면 그 세금계산서와 연결됩니다.
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="거래처명 검색"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg mb-3"
        />
        {error && <p className="text-xs text-danger mb-2">{error}</p>}
        {rows !== null && rows.length === 0 && <p className="text-sm text-text-muted py-6 text-center">불러올 세금계산서가 없습니다.</p>}
        {rows !== null && rows.length > 0 && (
          <div className="border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead className="bg-bg text-text-muted">
                <tr className="text-left">
                  <th className="py-2 px-3 font-medium">구분</th>
                  <th className="py-2 px-3 font-medium">작성일</th>
                  <th className="py-2 px-3 font-medium">거래처</th>
                  <th className="py-2 px-3 font-medium">품목</th>
                  <th className="py-2 px-3 font-medium text-right">공급가액</th>
                  <th className="py-2 px-3 font-medium text-right">부가세</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => onPick(r)} className="border-t border-border cursor-pointer hover:bg-bg">
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 font-medium ${TX_TYPE_STYLES[r.type]}`}>{TX_TYPE_LABELS[r.type]}</span>
                    </td>
                    <td className="py-2 px-3 tabular-nums">{r.issue_date}</td>
                    <td className="py-2 px-3">{r.client_name}</td>
                    <td className="py-2 px-3 max-w-[180px] truncate">{r.item_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.supply_amount)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.vat_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function TransactionFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const isEdit = editingId !== null;

  const [type, setType] = useState<TransactionType>("sales");
  const [transactionDate, setTransactionDate] = useState(todayISO());
  const [partyQuery, setPartyQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [rows, setRows] = useState<ItemRow[]>([{ ...EMPTY_ROW }]); // 품목 줄 (품목명 · 수량 · 단가)
  const [vatAmount, setVatAmount] = useState("0");
  const [vatManuallyEdited, setVatManuallyEdited] = useState(false);
  const [taxInvoiceNo, setTaxInvoiceNo] = useState("");
  const [memo, setMemo] = useState("");
  const [settled, setSettled] = useState(false);
  const [settledDate, setSettledDate] = useState(todayISO());
  const [linkedDoc, setLinkedDoc] = useState<TaxInvoiceCandidate | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<{ ok: boolean; messages: string[] } | null>(null);
  const pasteFileRef = useRef<HTMLInputElement>(null);

  // 수정 모드: 기존 내용을 불러와 채운다. 부가세는 저장된 값을 그대로 쓰도록 자동계산을 끈다.
  useEffect(() => {
    if (editingId === null) return;
    logDebug("TransactionForm", `수정할 거래 불러오기: id=${editingId}`);
    apiGet<Transaction>(`/api/transactions/${editingId}`)
      .then(async (tx) => {
        setType(tx.type);
        setTransactionDate(tx.transaction_date);
        setRows(rowsFromTransaction(tx));
        setVatAmount(String(tx.vat_amount));
        setVatManuallyEdited(true);
        setTaxInvoiceNo(tx.tax_invoice_no ?? "");
        setMemo(tx.memo ?? "");
        setSettled(tx.settled);
        setSettledDate(tx.settled_date ?? todayISO());
        if (tx.client_id !== null) {
          try {
            const client = await apiGet<Client>(`/api/clients/${tx.client_id}`);
            setSelectedClient(client);
            setPartyQuery(client.name);
          } catch (err) {
            logError("TransactionForm", "거래처 불러오기 실패", err);
            setPartyQuery(tx.client_name ?? tx.counterparty ?? "");
          }
        } else {
          setPartyQuery(tx.counterparty ?? "");
        }
      })
      .catch((err) => {
        logError("TransactionForm", "거래 불러오기 실패", err);
        setError(err instanceof ApiError ? err.message : "거래 내역을 불러오지 못했습니다.");
      });
  }, [editingId]);

  useEffect(() => {
    logDebug("TransactionForm", "거래처 전체 목록 불러오기");
    apiGet<Client[]>("/api/clients")
      .then(setClients)
      .catch((err) => logError("TransactionForm", "거래처 목록 불러오기 실패", err));
  }, []);

  const supplyAmount = String(rows.reduce((sum, r) => sum + rowAmount(r), 0)); // 공급가액 = 품목 금액 합계

  // 부가세를 직접 고치기 전까지는 공급가액이 바뀔 때마다 10%로 자동 계산한다 (렌더 중 조정: 효과로 한 번 더 그리지 않는다).
  const vatKey = `${supplyAmount}|${vatManuallyEdited}`;
  const [prevVatKey, setPrevVatKey] = useState(vatKey);
  if (vatKey !== prevVatKey) {
    setPrevVatKey(vatKey);
    if (!vatManuallyEdited) setVatAmount(String(calcVat(Number(supplyAmount) || 0)));
  }

  function changeParty(name: string) {
    setPartyQuery(name);
    setSelectedClient(clients.find((c) => c.name === name) ?? null);
  }

  async function pickInvoice(c: TaxInvoiceCandidate) {
    logDebug("TransactionForm", `세금계산서 불러오기: doc_id=${c.id}`);
    setLinkedDoc(c);
    setShowPicker(false);
    setSettled(false);
    setType(c.type);
    setTransactionDate(c.issue_date);
    setRows([{ name: c.item_name, quantity: "1", unitPrice: String(c.supply_amount) }]);
    setVatAmount(String(c.vat_amount));
    setVatManuallyEdited(true);
    setTaxInvoiceNo(c.tax_invoice_no ?? "");
    setMemo(`세금계산서 불러오기 (문서 #${c.id})`);
    setPartyQuery(c.client_name);
    setSelectedClient(null);
    if (c.client_id !== null) {
      try {
        const client = await apiGet<Client>(`/api/clients/${c.client_id}`);
        setSelectedClient(client);
        setPartyQuery(client.name);
      } catch (err) {
        logError("TransactionForm", "거래처 불러오기 실패", err);
      }
    }
  }

  /** 세금계산서 스크린샷(사진)을 인식해 입력란을 채운다. 인식한 값은 사용자가 확인·수정한 뒤 저장한다. */
  async function scanScreenshot(file: File) {
    setError(null);
    setScanNotice(null);
    setIsScanning(true);
    try {
      logDebug("TransactionForm", `세금계산서 스크린샷 인식 요청: ${file.name}, ${file.type}, ${file.size}B`);
      const r = await apiUpload<TaxInvoiceOcrResult>("/api/project-documents/ocr/tax-invoice", file);
      logDebug("TransactionForm", `스크린샷 인식 성공: direction=${r.direction}, supply=${r.supply_amount}, warnings=${r.warnings.length}`);
      setLinkedDoc(null); // 스크린샷은 문서와 연결하지 않는다 (입력란만 채움)
      if (r.direction) setType(r.direction);
      if (r.issue_date) setTransactionDate(r.issue_date);
      const scanned = rowsFromScan(r);
      if (scanned) setRows(scanned);
      if (r.vat_amount !== null) {
        setVatAmount(String(r.vat_amount));
        setVatManuallyEdited(true);
      }
      if (r.approval_no) setTaxInvoiceNo(r.approval_no);
      const name = r.counterparty_name ?? "";
      if (name) {
        setPartyQuery(name);
        setSelectedClient(clients.find((c) => c.name === name) ?? null);
      }
      setMemo("세금계산서 스크린샷으로 입력");
      setScanNotice({ ok: true, messages: r.warnings });
    } catch (err) {
      logError("TransactionForm", "스크린샷 인식 실패", err);
      setScanNotice({ ok: false, messages: [err instanceof ApiError ? err.message : "스크린샷을 인식하지 못했습니다. 직접 입력해주세요."] });
    } finally {
      setIsScanning(false);
    }
  }

  // Ctrl+V 로 붙여 넣은 스크린샷은 앱 전체의 붙여넣기(fileDrop)가 아래 파일 칸에 넣어 주므로 handleScreenshotFile 이 받는다.
  function handleScreenshotFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void scanScreenshot(file);
  }

  const total = (Number(supplyAmount) || 0) + (Number(vatAmount) || 0);

  function updateRow(i: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, { ...EMPTY_ROW }]));
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const body = {
        type,
        transaction_date: transactionDate,
        client_id: selectedClient?.id ?? null,
        counterparty: selectedClient ? null : partyQuery.trim() || null,
        item_name: summaryName(rows),
        supply_amount: Number(supplyAmount) || 0,
        vat_amount: Number(vatAmount) || 0,
        items: itemsPayload(rows),
        tax_invoice_no: taxInvoiceNo || null,
        memo: memo || null,
        settled,
        settled_date: settled ? settledDate : null,
        ...(editingId === null && linkedDoc ? { tax_invoice_doc_id: linkedDoc.id } : {}),
      };
      if (editingId !== null) {
        logDebug("TransactionForm", `수정 저장: id=${editingId}`);
        await apiPut<Transaction>(`/api/transactions/${editingId}`, body);
      } else {
        await apiPost<Transaction>("/api/transactions", body);
      }
      navigate("/transactions", { replace: true });
    } catch (err) {
      logError("TransactionForm", isEdit ? "수정 실패" : "등록 실패", err);
      setError(err instanceof ApiError ? err.message : `${isEdit ? "수정" : "등록"} 중 오류가 발생했습니다.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title={isEdit ? "거래 수정" : "새 거래 등록"}>
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-xl">
        {!isEdit && (
          <div className="rounded-xl bg-bg border border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 text-sm border border-border bg-surface rounded-lg px-4 py-2 hover:bg-bg"
            >
              <FileText size={15} />
              {linkedDoc ? "다른 세금계산서 불러오기" : "세금계산서 불러오기"}
            </button>
            <p className="text-xs text-text-muted mt-1.5">
              {linkedDoc
                ? `불러온 세금계산서: ${linkedDoc.client_name} · ${linkedDoc.issue_date} · ${formatCurrency(linkedDoc.supply_amount + linkedDoc.vat_amount)} (저장하면 연결됩니다)`
                : "이미 작성한 세금계산서가 있으면 불러와서 다시 입력하지 않아도 됩니다."}
            </p>
            <div className="mt-3 pt-3 border-t border-border">
              <input ref={pasteFileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleScreenshotFile} className="hidden" />
              <button
                type="button"
                onClick={() => pasteFileRef.current?.click()}
                disabled={isScanning}
                className="flex items-center gap-1.5 text-sm border border-border bg-surface rounded-lg px-4 py-2 hover:bg-bg disabled:opacity-50"
              >
                <ClipboardPaste size={15} />
                {isScanning ? "스크린샷 인식 중..." : "스크린샷으로 입력"}
              </button>
              <p className="text-xs text-text-muted mt-1.5">
                홈택스 세금계산서 화면을 캡처해 복사한 뒤 이 화면에서 <b>Ctrl+V</b> 로 붙여 넣으면 내용이 입력란에 채워집니다. (이미지 파일을 직접 고를 수도 있습니다)
              </p>
              {scanNotice && (
                <div role="status" className={`mt-2 text-xs ${scanNotice.ok ? "text-text-muted" : "text-danger"}`}>
                  {scanNotice.ok && <p className="text-tile-green-fg font-medium">스크린샷에서 읽은 내용을 입력했습니다. 틀린 곳이 없는지 확인해 주세요.</p>}
                  {scanNotice.messages.map((m) => (
                    <p key={m}>{m}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-text-muted mb-1.5">구분</label>
          <div className="flex gap-2">
            {(Object.keys(TX_TYPE_LABELS) as TransactionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  type === t
                    ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                    : "border-border text-text-muted hover:bg-bg"
                }`}
              >
                {TX_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">거래일</label>
          <input
            type="date"
            required
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">거래처 (목록에서 선택하거나 검색, 없으면 직접 입력)</label>
          <ClientCombobox value={partyQuery} onChange={changeParty} clients={clients} />
          {selectedClient && <p className="text-xs text-success mt-1.5">등록된 거래처: {selectedClient.name}</p>}
        </div>

        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_6rem_6rem_1.5rem] items-center gap-2 mb-1.5 text-xs text-text-muted">
            <span>품목/내용</span>
            <span className="text-right">수량</span>
            <span className="text-right">단가</span>
            <span className="text-right">금액</span>
            <span />
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_3.5rem_6rem_6rem_1.5rem] items-center gap-2">
                <input
                  required={i === 0}
                  aria-label={`품목 ${i + 1}`}
                  value={r.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
                />
                <NumberInput
                  aria-label={`수량 ${i + 1}`}
                  value={r.quantity}
                  onChange={(v) => updateRow(i, { quantity: v })}
                  className="w-full rounded-lg border border-border px-2 py-2 text-sm text-right outline-none focus:border-primary bg-bg"
                />
                <NumberInput
                  aria-label={`단가 ${i + 1}`}
                  value={r.unitPrice}
                  onChange={(v) => updateRow(i, { unitPrice: v })}
                  className="w-full rounded-lg border border-border px-2 py-2 text-sm text-right outline-none focus:border-primary bg-bg"
                />
                <span className="text-right text-sm font-semibold tabular-nums">{formatCurrency(rowAmount(r))}</span>
                {rows.length > 1 ? (
                  <button type="button" onClick={() => removeRow(i)} aria-label={`품목 ${i + 1} 삭제`} title="삭제" className="text-text-muted hover:text-danger">
                    <X size={15} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            aria-label="품목 추가"
            title="품목 추가"
            className="mt-2 rounded-lg border border-dashed border-primary bg-tile-blue px-5 py-1.5 text-base font-bold leading-none text-primary hover:opacity-80"
          >
            +
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">공급가액 (품목 금액 합계)</label>
            <div className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-bg text-right tabular-nums">{formatCurrency(Number(supplyAmount) || 0)}</div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">부가세 (자동계산, 수정 가능)</label>
            <NumberInput
              value={vatAmount}
              onChange={(v) => {
                setVatAmount(v);
                setVatManuallyEdited(true);
              }}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
        </div>
        <p className="text-xs text-text-muted">합계: {formatCurrency(total)}</p>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">세금계산서 번호 (선택)</label>
          <input
            value={taxInvoiceNo}
            onChange={(e) => setTaxInvoiceNo(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">결제 상태</label>
          <div className="flex items-center gap-2">
            <select
              value={settled ? "settled" : "unsettled"}
              onChange={(e) => setSettled(e.target.value === "settled")}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            >
              <option value="unsettled">{type === "sales" ? "외상매출 (미수)" : "외상매입 (미지급)"}</option>
              <option value="settled">{type === "sales" ? "입금완료" : "결제완료"}</option>
            </select>
            {settled && (
              <input
                type="date"
                value={settledDate}
                onChange={(e) => setSettledDate(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            )}
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            외상으로 두면 입출금관리에서 이 내역을 불러와 입금/출금 처리할 때 자동으로 결제완료로 바뀝니다.
          </p>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">메모</label>
          <textarea
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? (isEdit ? "저장 중..." : "등록 중...") : isEdit ? "저장" : "등록"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
          >
            취소
          </button>
        </div>
      </form>
      {showPicker && <TaxInvoicePicker onPick={pickInvoice} onClose={() => setShowPicker(false)} />}
    </MainLayout>
  );
}
