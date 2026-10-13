import { FileText, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { Client } from "../clients/types";
import { ApiError, apiGet, apiPost, apiPut, apiUpload } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import {
  BANK_TYPE_LABELS,
  CARD_TYPE_LABELS,
  PAYMENT_CATEGORIES,
  PAYMENT_CATEGORY_ITEMS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_STYLES,
  PROOF_TYPE_LABELS,
  type BankType,
  type CardType,
  type Payment,
  type PaymentCategory,
  type PaymentTransactionCandidate,
  type PaymentMethod,
  type PaymentType,
  type ProofType,
} from "./types";
import { ClientCombobox } from "../../components/ui/ClientCombobox";
import { NumberInput } from "../../components/ui/NumberInput";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function TransactionPicker({ onPick, onClose }: { onPick: (c: PaymentTransactionCandidate) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PaymentTransactionCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      logDebug("PaymentForm", `불러올 외상 매입매출 조회: q=${q}`);
      apiGet<PaymentTransactionCandidate[]>(`/api/payments/linkable-transactions?q=${encodeURIComponent(q)}`)
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch((err) => {
          logError("PaymentForm", "외상 매입매출 목록 조회 실패", err);
          setError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">매입매출 불러오기 (외상)</h3>
          <button onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">
          아직 결제되지 않은 외상매출/외상매입만 보입니다. 선택해 저장하면 해당 내역이 매입매출관리에서 결제완료로 바뀌고, 입출금 날짜가 완료일로 기록됩니다.
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="거래처/품목 검색"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg mb-3"
        />
        {error && <p className="text-xs text-danger mb-2">{error}</p>}
        {rows !== null && rows.length === 0 && <p className="text-sm text-text-muted py-6 text-center">결제할 외상 내역이 없습니다.</p>}
        {rows !== null && rows.length > 0 && (
          <div className="border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-xs min-w-[520px]">
              <thead className="bg-bg text-text-muted">
                <tr className="text-left">
                  <th className="py-2 px-3 font-medium">구분</th>
                  <th className="py-2 px-3 font-medium">거래일</th>
                  <th className="py-2 px-3 font-medium">거래처</th>
                  <th className="py-2 px-3 font-medium">품목</th>
                  <th className="py-2 px-3 font-medium text-right">합계금액</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => onPick(r)} className="border-t border-border cursor-pointer hover:bg-bg">
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 font-medium ${PAYMENT_TYPE_STYLES[r.type]}`}>
                        {r.type === "deposit" ? "외상매출" : "외상매입"}
                      </span>
                    </td>
                    <td className="py-2 px-3 tabular-nums">{r.transaction_date}</td>
                    <td className="py-2 px-3">{r.client_name}</td>
                    <td className="py-2 px-3 max-w-[200px] truncate">{r.item_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.total_amount)}</td>
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

export function PaymentFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

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
  const [clients, setClients] = useState<Client[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [memo, setMemo] = useState("");
  const [proofType, setProofType] = useState<ProofType | null>(null);
  const [proofTypeDetail, setProofTypeDetail] = useState("");
  const [cardType, setCardType] = useState<CardType | null>(null);
  const [bankType, setBankType] = useState<BankType | null>(null);

  // 증빙(세금계산서/영수증 등) 발행 여부는 계좌이체와 현금 건에서 선택한다.
  const usesProof = method === "bank_transfer" || method === "cash";
  const [hasReceipt, setHasReceipt] = useState(false);
  const [linkedTx, setLinkedTx] = useState<PaymentTransactionCandidate | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    logDebug("PaymentForm", "거래처 전체 목록 불러오기");
    apiGet<Client[]>("/api/clients")
      .then(setClients)
      .catch((err) => logError("PaymentForm", "거래처 목록 불러오기 실패", err));
  }, []);

  useEffect(() => {
    if (method !== "bank_transfer" && method !== "cash") {
      setProofType(null);
      setProofTypeDetail("");
    }
    if (method !== "bank_transfer") {
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

  function changeCategory(next: PaymentCategory) {
    setCategory(next);
    setItem("");
    setCustomText("");
    setManualItem("");
  }

  // 수정 화면: 기존 내역을 불러와 입력칸을 채운다.
  useEffect(() => {
    if (!id) return;
    logDebug("PaymentForm", `수정할 내역 조회: id=${id}`);
    apiGet<Payment>(`/api/payments/${id}`)
      .then((p) => {
        const cat = (PAYMENT_CATEGORIES as readonly string[]).includes(p.category) ? (p.category as PaymentCategory) : PAYMENT_CATEGORIES[0];
        const items = PAYMENT_CATEGORY_ITEMS[cat];
        setType(p.type);
        setPaymentDate(p.payment_date);
        setCategory(cat);
        if (items) {
          if (items.includes(p.description)) {
            setItem(p.description);
          } else {
            setItem("기타");
            setCustomText(p.description);
          }
        } else {
          setManualItem(p.description);
        }
        setAmount(String(p.amount));
        setMethod(p.method);
        setCardType(p.card_type);
        setBankType(p.bank_type);
        setProofType(p.proof_type);
        setProofTypeDetail(p.proof_type_detail ?? "");
        if (p.client_id !== null && p.client_name) {
          setSelectedClient({ id: p.client_id, name: p.client_name } as Client);
          setPartyQuery(p.client_name);
        }
        setMemo(p.memo ?? "");
        setHasReceipt(p.has_receipt);
      })
      .catch((err) => {
        logError("PaymentForm", "수정할 내역 조회 실패", err);
        setError("입출금 내역을 불러오지 못했습니다.");
      })
      .finally(() => setIsLoading(false));
  }, [id]);

  function changeParty(name: string) {
    setPartyQuery(name);
    setSelectedClient(clients.find((c) => c.name === name) ?? null);
  }

  // 외상 매출/매입을 불러와 입력칸을 채운다. 분류는 외상매출금/외상매입금으로 두고, 결제수단과 계좌 종류는 직접 고른다.
  async function pickTransaction(c: PaymentTransactionCandidate) {
    logDebug("PaymentForm", `외상 매입매출 불러오기: tx_id=${c.id}`);
    setLinkedTx(c);
    setShowPicker(false);
    setType(c.type);
    setPaymentDate(todayISO());
    changeCategory(c.type === "deposit" ? "외상매출금" : "외상매입금");
    setManualItem(`${c.item_name} ${c.type === "deposit" ? "입금" : "지급"}`.slice(0, 300));
    setAmount(String(c.total_amount));
    setMethod("bank_transfer");
    setProofType("tax_invoice");
    setMemo(`매입매출 불러오기 (내역 #${c.id}${c.tax_invoice_no ? `, ${c.tax_invoice_no}` : ""})`);
    setPartyQuery(c.client_name);
    setSelectedClient(null);
    if (c.client_id !== null) {
      try {
        const client = await apiGet<Client>(`/api/clients/${c.client_id}`);
        setSelectedClient(client);
        setPartyQuery(client.name);
      } catch (err) {
        logError("PaymentForm", "거래처 불러오기 실패", err);
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (usesProof && proofType === "other" && !proofTypeDetail.trim()) {
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
      const body = {
        type,
        payment_date: paymentDate,
        category,
        description,
        amount: Number(amount) || 0,
        method,
        client_id: selectedClient?.id ?? null,
        memo: memo || null,
        proof_type: usesProof ? proofType : null,
        proof_type_detail: usesProof && proofType === "other" ? proofTypeDetail : null,
        card_type: method === "corporate_card" ? cardType : null,
        bank_type: method === "bank_transfer" ? bankType : null,
        ...(!isEdit && linkedTx ? { transaction_id: linkedTx.id } : {}),
      };

      logDebug("PaymentForm", `${isEdit ? "수정" : "등록"} 시도: category=${category}, amount=${body.amount}`);
      const saved = isEdit ? await apiPut<Payment>(`/api/payments/${id}`, body) : await apiPost<Payment>("/api/payments", body);

      if (receiptFile) {
        await apiUpload(`/api/payments/${saved.id}/receipt`, receiptFile);
      }

      navigate("/payments", { replace: true });
    } catch (err) {
      logError("PaymentForm", `${isEdit ? "수정" : "등록"} 실패`, err);
      setError(err instanceof ApiError ? err.message : `${isEdit ? "수정" : "등록"} 중 오류가 발생했습니다.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title={isEdit ? "입출금 수정" : "새 입출금 등록"}>
      {isLoading ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : (
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-xl">
        {!isEdit && (
          <div className="rounded-xl bg-bg border border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 text-sm border border-border bg-surface rounded-lg px-4 py-2 hover:bg-bg"
            >
              <FileText size={15} />
              {linkedTx ? "다른 매입매출 불러오기" : "매입매출 불러오기 (외상)"}
            </button>
            <p className="text-xs text-text-muted mt-1.5">
              {linkedTx
                ? `불러온 내역: ${linkedTx.client_name} · ${linkedTx.transaction_date} · ${formatCurrency(linkedTx.total_amount)} (계좌 종류를 고른 뒤 저장하면 결제완료로 처리됩니다)`
                : "세금계산서로 기록된 외상매출/외상매입에 대한 입금·출금이면 불러와서 결제 처리하세요."}
            </p>
          </div>
        )}

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

        {usesProof && (
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
            <p className="text-xs text-text-muted mt-1.5">계좌이체·현금 건은 세금계산서/영수증 등 증빙 발행 여부를 선택할 수 있습니다.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">분류</label>
            <select
              value={category}
              onChange={(e) => changeCategory(e.target.value as PaymentCategory)}
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
          <NumberInput
            required
            value={amount}
            onChange={setAmount}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">거래처 (선택)</label>
          <ClientCombobox value={partyQuery} onChange={changeParty} clients={clients} />
          {selectedClient && <p className="text-xs text-success mt-1.5">선택됨: {selectedClient.name}</p>}
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">
            영수증 이미지 (선택){isEdit && hasReceipt && " · 이미 첨부되어 있습니다. 새 파일을 고르면 교체됩니다."}
          </label>
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
      )}
      {showPicker && <TransactionPicker onPick={pickTransaction} onClose={() => setShowPicker(false)} />}
    </MainLayout>
  );
}
