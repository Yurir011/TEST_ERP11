import { Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { Client } from "../clients/types";
import { ApiError, apiGet, apiPost, apiUpload } from "../../lib/api";
import { logError } from "../../lib/logger";
import { PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS, type Payment, type PaymentMethod, type PaymentType } from "./types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentFormPage() {
  const navigate = useNavigate();

  const [type, setType] = useState<PaymentType>("withdrawal");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("0");
  const [method, setMethod] = useState<PaymentMethod>("corporate_card");
  const [partyQuery, setPartyQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
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
        .catch((err) => logError("PaymentForm", "거래처 검색 실패", err));
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

  function pickClient(client: Client) {
    setSelectedClient(client);
    setPartyQuery(client.name);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await apiPost<Payment>("/api/payments", {
        type,
        payment_date: paymentDate,
        category,
        description,
        amount: Number(amount) || 0,
        method,
        client_id: selectedClient?.id ?? null,
        memo: memo || null,
      });

      if (receiptFile) {
        await apiUpload(`/api/payments/${created.id}/receipt`, receiptFile);
      }

      navigate("/payments", { replace: true });
    } catch (err) {
      logError("PaymentForm", "등록 실패", err);
      setError(err instanceof ApiError ? err.message : "등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title="새 입출금 등록">
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-xl">
        <div>
          <label className="block text-xs text-text-muted mb-1.5">구분</label>
          <div className="flex gap-2">
            {(Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map((t) => (
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
                {PAYMENT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">날짜</label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">결제수단</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">분류</label>
          <input
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="예: 경비, 급여, 매출입금"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">내용</label>
          <input
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">금액</label>
          <input
            type="number"
            min={0}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>

        <div className="relative" ref={boxRef}>
          <label className="block text-xs text-text-muted mb-1.5">거래처 (선택)</label>
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
              placeholder="거래처명 검색"
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
          {selectedClient && <p className="text-xs text-success mt-1.5">선택됨: {selectedClient.name}</p>}
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">영수증 이미지 (선택)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
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
