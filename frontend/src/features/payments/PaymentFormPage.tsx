import { Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { Client } from "../clients/types";
import { ApiError, apiGet, apiPost, apiUpload } from "../../lib/api";
import { logError } from "../../lib/logger";
import {
  BANK_TYPE_LABELS,
  CARD_TYPE_LABELS,
  PAYMENT_CATEGORIES,
  PAYMENT_CATEGORY_ITEMS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  PROOF_TYPE_LABELS,
  type BankType,
  type CardType,
  type Payment,
  type PaymentCategory,
  type PaymentMethod,
  type PaymentType,
  type ProofType,
} from "./types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentFormPage() {
  const navigate = useNavigate();

  const [type, setType] = useState<PaymentType>("withdrawal");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [category, setCategory] = useState<PaymentCategory>(PAYMENT_CATEGORIES[0]);
  const [item, setItem] = useState("");
  const [customText, setCustomText] = useState("");
  const [manualItem, setManualItem] = useState("");
  const [amount, setAmount] = useState("0");
  const [method, setMethod] = useState<PaymentMethod>("corporate_card");
  const [partyQuery, setPartyQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [memo, setMemo] = useState("");
  const [proofType, setProofType] = useState<ProofType | null>(null);
  const [proofTypeDetail, setProofTypeDetail] = useState("");
  const [cardType, setCardType] = useState<CardType | null>(null);
  const [bankType, setBankType] = useState<BankType | null>(null);

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

  useEffect(() => {
    if (method !== "bank_transfer") {
      setProofType(null);
      setProofTypeDetail("");
      setBankType(null);
    }
    if (method !== "corporate_card") {
      setCardType(null);
    }
  }, [method]);

  const categoryItems = PAYMENT_CATEGORY_ITEMS[category];
  // 항목 목록이 없는 분류(기타 포함)는 "항목" 칸에 직접 입력한다. 항목 목록이 있는 분류에서 "기타"를 고른 경우는
  // 별도의 "내용 직접 입력" 칸을 쓴다 (기존 동작 유지).
  const needsManualItem = !categoryItems;
  const needsCustomText = !needsManualItem && item === "기타";

  useEffect(() => {
    setItem("");
    setCustomText("");
    setManualItem("");
  }, [category]);

  function pickClient(client: Client) {
    setSelectedClient(client);
    setPartyQuery(client.name);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (method === "bank_transfer" && proofType === "other" && !proofTypeDetail.trim()) {
      setError("증빙 종류를 '기타'로 선택한 경우 내용을 입력해주세요.");
      return;
    }
    if (method === "corporate_card" && !cardType) {
      setError("카드 종류를 선택해주세요.");
      return;
    }
    if (method === "bank_transfer" && !bankType) {
      setError("계좌 종류를 선택해주세요.");
      return;
    }
    if (categoryItems && !item) {
      setError("항목을 선택해주세요.");
      return;
    }
    if (needsCustomText && !customText.trim()) {
      setError("내용을 직접 입력해주세요.");
      return;
    }
    if (needsManualItem && !manualItem.trim()) {
      setError("항목을 입력해주세요.");
      return;
    }

    const description = needsManualItem ? manualItem.trim() : item === "기타" ? customText.trim() : item;

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
        proof_type: method === "bank_transfer" ? proofType : null,
        proof_type_detail: method === "bank_transfer" && proofType === "other" ? proofTypeDetail : null,
        card_type: method === "corporate_card" ? cardType : null,
        bank_type: method === "bank_transfer" ? bankType : null,
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

        {method === "corporate_card" && (
          <div>
            <label className="block text-xs text-text-muted mb-1.5">카드 종류</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CARD_TYPE_LABELS) as CardType[]).map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setCardType(ct)}
                  className={`rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    cardType === ct
                      ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                      : "border-border text-text-muted hover:bg-bg"
                  }`}
                >
                  {CARD_TYPE_LABELS[ct]}
                </button>
              ))}
            </div>
          </div>
        )}

        {method === "bank_transfer" && (
          <div>
            <label className="block text-xs text-text-muted mb-1.5">계좌 종류</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(BANK_TYPE_LABELS) as BankType[]).map((bt) => (
                <button
                  key={bt}
                  type="button"
                  onClick={() => setBankType(bt)}
                  className={`rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    bankType === bt
                      ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                      : "border-border text-text-muted hover:bg-bg"
                  }`}
                >
                  {BANK_TYPE_LABELS[bt]}
                </button>
              ))}
            </div>
          </div>
        )}

        {method === "bank_transfer" && (
          <div>
            <label className="block text-xs text-text-muted mb-1.5">증빙 발행 여부</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PROOF_TYPE_LABELS) as ProofType[]).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setProofType(proofType === pt ? null : pt)}
                  className={`rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    proofType === pt
                      ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                      : "border-border text-text-muted hover:bg-bg"
                  }`}
                >
                  {PROOF_TYPE_LABELS[pt]}
                </button>
              ))}
            </div>
            {proofType === "other" && (
              <input
                required
                value={proofTypeDetail}
                onChange={(e) => setProofTypeDetail(e.target.value)}
                placeholder="증빙 내용을 직접 입력하세요"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg mt-2"
              />
            )}
            <p className="text-xs text-text-muted mt-1.5">계좌이체 건은 세금계산서/영수증 등 증빙 발행 여부를 선택할 수 있습니다.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">분류</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PaymentCategory)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            >
              {PAYMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {categoryItems && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5">항목</label>
              <select
                required
                value={item}
                onChange={(e) => setItem(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              >
                <option value="" disabled>
                  선택
                </option>
                {categoryItems.map((it) => (
                  <option key={it} value={it}>
                    {it}
                  </option>
                ))}
              </select>
            </div>
          )}
          {needsManualItem && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5">항목</label>
              <input
                required
                value={manualItem}
                onChange={(e) => setManualItem(e.target.value)}
                placeholder="항목을 직접 입력하세요"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
          )}
        </div>

        {needsCustomText && (
          <div>
            <label className="block text-xs text-text-muted mb-1.5">내용 직접 입력</label>
            <input
              required
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="내용을 입력하세요"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>
        )}

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
