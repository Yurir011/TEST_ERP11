import { Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { Client } from "../clients/types";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logError } from "../../lib/logger";
import { TX_TYPE_LABELS, type Transaction, type TransactionType } from "./types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionFormPage() {
  const navigate = useNavigate();

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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

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

  const total = (Number(supplyAmount) || 0) + (Number(vatAmount) || 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiPost<Transaction>("/api/transactions", {
        type,
        transaction_date: transactionDate,
        client_id: selectedClient?.id ?? null,
        counterparty: selectedClient ? null : partyQuery.trim() || null,
        item_name: itemName,
        supply_amount: Number(supplyAmount) || 0,
        vat_amount: Number(vatAmount) || 0,
        tax_invoice_no: taxInvoiceNo || null,
        memo: memo || null,
      });
      navigate("/transactions", { replace: true });
    } catch (err) {
      logError("TransactionForm", "등록 실패", err);
      setError(err instanceof ApiError ? err.message : "등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title="새 거래 등록">
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-xl">
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
            <input
              type="number"
              min={0}
              value={supplyAmount}
              onChange={(e) => setSupplyAmount(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">부가세 (자동계산, 수정 가능)</label>
            <input
              type="number"
              min={0}
              value={vatAmount}
              onChange={(e) => {
                setVatAmount(e.target.value);
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
            {isSubmitting ? "등록 중..." : "등록"}
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
    </MainLayout>
  );
}
