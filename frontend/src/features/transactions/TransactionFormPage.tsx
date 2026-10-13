import { FileText, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { Client } from "../clients/types";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { TX_TYPE_LABELS, TX_TYPE_STYLES, type TaxInvoiceCandidate, type Transaction, type TransactionType } from "./types";
import { NumberInput } from "../../components/ui/NumberInput";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [itemName, setItemName] = useState("");
  const [supplyAmount, setSupplyAmount] = useState("0");
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
  const boxRef = useRef<HTMLDivElement>(null);

  // 수정 모드: 기존 내용을 불러와 채운다. 부가세는 저장된 값을 그대로 쓰도록 자동계산을 끈다.
  useEffect(() => {
    if (editingId === null) return;
    logDebug("TransactionForm", `수정할 거래 불러오기: id=${editingId}`);
    apiGet<Transaction>(`/api/transactions/${editingId}`)
      .then(async (tx) => {
        setType(tx.type);
        setTransactionDate(tx.transaction_date);
        setItemName(tx.item_name);
        setSupplyAmount(String(tx.supply_amount));
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
    if (!partyQuery || selectedClient) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      apiGet<Client[]>(`/api/clients?q=${encodeURIComponent(partyQuery)}`)
        .then(setSuggestions)
        .catch((err) => logError("TransactionForm", "거래처 검색 실패", err));
    }, 200);
    return () => clearTimeout(timer);
  }, [partyQuery, selectedClient]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (vatManuallyEdited) return;
    const supply = Number(supplyAmount) || 0;
    setVatAmount(String(Math.round(supply * 0.1)));
  }, [supplyAmount, vatManuallyEdited]);

  function pickClient(client: Client) {
    setSelectedClient(client);
    setPartyQuery(client.name);
    setShowSuggestions(false);
  }

  async function pickInvoice(c: TaxInvoiceCandidate) {
    logDebug("TransactionForm", `세금계산서 불러오기: doc_id=${c.id}`);
    setLinkedDoc(c);
    setShowPicker(false);
    setSettled(false);
    setType(c.type);
    setTransactionDate(c.issue_date);
    setItemName(c.item_name);
    setSupplyAmount(String(c.supply_amount));
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

  const total = (Number(supplyAmount) || 0) + (Number(vatAmount) || 0);

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
        item_name: itemName,
        supply_amount: Number(supplyAmount) || 0,
        vat_amount: Number(vatAmount) || 0,
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

        <div className="relative" ref={boxRef}>
          <label className="block text-xs text-text-muted mb-1.5">거래처 (등록된 거래처 검색, 없으면 직접 입력)</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={partyQuery}
              onChange={(e) => {
                setPartyQuery(e.target.value);
                setSelectedClient(null);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="거래처명 검색 또는 직접 입력"
              className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-lg shadow-sm max-h-56 overflow-y-auto">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pickClient(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedClient && <p className="text-xs text-success mt-1.5">등록된 거래처: {selectedClient.name}</p>}
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">품목/내용</label>
          <input
            required
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">공급가액</label>
            <NumberInput
              value={supplyAmount}
              onChange={setSupplyAmount}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
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
