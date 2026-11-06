import { Camera, Check, ImagePlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { NumberInput } from "../../components/ui/NumberInput";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiGet, apiPost, apiUpload } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { descriptionFields, needsCustomText, needsManualItem, resolveDescription, validatePaymentForm } from "../payments/paymentForm";
import { usePaymentAccounts } from "../payments/paymentAccounts";
import { PAYMENT_CATEGORIES, PAYMENT_CATEGORY_ITEMS, type Payment, type PaymentCategory } from "../payments/types";
import { MobileCard, MobileLayout } from "./MobileLayout";

const MAX_PHOTO_EDGE = 1600; // 폰 사진은 크고 느려서 긴 변 1600px 이하 JPEG 로 줄여 올린다
const inputCls = "w-full rounded-xl border border-border px-3 py-3 text-base outline-none focus:border-primary bg-surface";

/** 내가 쓰는 카드: 한 번 고르면 이 폰에 기억해 두고 다음부터 맨 앞에 둔다 (직원별로 따로) */
const preferredKey = (userId: number | undefined) => `bench.mobileCard.preferred.${userId ?? 0}`;
function readPreferred(userId: number | undefined): string | null {
  try {
    return localStorage.getItem(preferredKey(userId));
  } catch {
    return null;
  }
}
function writePreferred(userId: number | undefined, code: string) {
  try {
    localStorage.setItem(preferredKey(userId), code);
  } catch {
    /* 저장이 막힌 환경: 기억만 못 할 뿐 입력에는 지장 없다 */
  }
}

/** 사진을 줄여 JPEG 파일로 만든다. 줄이지 못하면 원본을 그대로 쓴다. */
async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    logDebug("MobileCard", `영수증 사진 축소: ${Math.round(file.size / 1024)}KB → ${Math.round(blob.size / 1024)}KB`);
    return new File([blob], "receipt.jpg", { type: "image/jpeg" });
  } catch (err) {
    logError("MobileCard", "사진 축소 실패, 원본 사용", err);
    return file;
  }
}

export function MobileCardPage() {
  const { user } = useAuth();
  const { cards, loaded, cardName } = usePaymentAccounts();
  const [cardCode, setCardCode] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<PaymentCategory>(PAYMENT_CATEGORIES[0]);
  const [item, setItem] = useState("");
  const [customText, setCustomText] = useState("");
  const [manualItem, setManualItem] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [memo, setMemo] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [recent, setRecent] = useState<Payment[] | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  // 카드 목록이 오면 내가 쓰던 카드를 먼저 고른다 (없거나 숨겨진 카드면 목록 맨 앞)
  const selected = cardCode ?? (() => {
    const pref = readPreferred(user?.id);
    return cards.find((c) => c.code === pref)?.code ?? cards[0]?.code ?? null;
  })();
  // 내 카드를 맨 앞에 둔다
  const orderedCards = useMemo(() => {
    const pref = readPreferred(user?.id);
    return [...cards].sort((a, b) => Number(b.code === pref) - Number(a.code === pref));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, user?.id, cardCode]);

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  function loadRecent() {
    const now = new Date();
    apiGet<Payment[]>(`/api/payments?method=corporate_card&year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then((rows) => setRecent(rows.slice(0, 5)))
      .catch((err) => {
        logError("MobileCard", "최근 카드 사용내역 조회 실패", err);
        setRecent([]);
      });
  }
  useEffect(loadRecent, []);

  function pickCard(code: string) {
    setCardCode(code);
    writePreferred(user?.id, code);
    logDebug("MobileCard", `내 카드 선택: ${code}`);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhoto(await shrinkPhoto(file));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setDone(null);
    const won = Number(amount.replace(/[^0-9]/g, ""));
    const fields = { category, item, customText, manualItem };
    const problem =
      !selected ? "법인카드를 선택해주세요." : !won ? "금액을 입력해주세요."
      : validatePaymentForm({ ...fields, method: "corporate_card", proofType: null, proofTypeDetail: "", cardType: selected, bankType: null });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      logDebug("MobileCard", `지출 등록 시도: card=${selected}, amount=${won}, category=${category}, photo=${!!photo}`);
      const saved = await apiPost<Payment>("/api/payments", {
        type: "withdrawal",
        payment_date: date,
        category,
        description: resolveDescription(fields),
        amount: won,
        method: "corporate_card",
        card_type: selected,
        counterparty: counterparty.trim() || null,
        memo: memo.trim() || null,
      });
      if (photo) {
        try {
          await apiUpload(`/api/payments/${saved.id}/receipt`, photo);
        } catch (err) {
          // 지출은 이미 저장됐다. 사진만 실패한 경우를 따로 알려 중복 입력을 막는다.
          logError("MobileCard", "영수증 업로드 실패 (지출은 저장됨)", err);
          setDone("지출은 저장했지만 영수증 사진을 올리지 못했습니다. PC에서 입출금 내역에 사진을 다시 올려 주세요.");
          resetForm();
          loadRecent();
          return;
        }
      }
      logDebug("MobileCard", `지출 등록 성공: payment_id=${saved.id}`);
      setDone(`${formatCurrency(won)} 지출을 등록했습니다.`);
      resetForm();
      loadRecent();
    } catch (err) {
      logError("MobileCard", "지출 등록 실패", err);
      setError(err instanceof ApiError ? err.message : "등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  /** 카드·날짜는 그대로 두고 나머지만 비운다 (이어서 다음 건을 넣기 쉽게) */
  function resetForm() {
    setAmount("");
    setItem("");
    setCustomText("");
    setManualItem("");
    setCounterparty("");
    setMemo("");
    setPhoto(null);
  }

  const items = PAYMENT_CATEGORY_ITEMS[category];

  return (
    <MobileLayout title="법인카드 지출">
      <form onSubmit={submit} className="space-y-4">
        <MobileCard className="space-y-3">
          <div>
            <p className="text-xs text-text-muted mb-1.5">사용한 카드 {selected && "(고른 카드는 다음에도 맨 앞에 나옵니다)"}</p>
            {!loaded ? (
              <p className="text-xs text-text-muted">카드 목록을 불러오는 중...</p>
            ) : orderedCards.length === 0 ? (
              <p className="text-sm text-danger">등록된 법인카드가 없습니다. PC의 입출금관리에서 카드를 먼저 등록해주세요.</p>
            ) : (
              <div role="radiogroup" aria-label="법인카드" className="flex flex-wrap gap-2">
                {orderedCards.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    role="radio"
                    aria-checked={selected === c.code}
                    onClick={() => pickCard(c.code)}
                    className={`px-3.5 py-2 rounded-xl border text-sm ${selected === c.code ? "border-primary bg-primary text-on-primary font-semibold" : "border-border bg-surface"}`}
                  >
                    {c.nickname}
                    {c.last4 && <span className="opacity-70"> ·{c.last4}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="block">
            <span className="text-xs text-text-muted">사용일</span>
            <input id="card-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">금액 (원)</span>
            <NumberInput
              id="card-amount"
              value={amount}
              onChange={setAmount}
              placeholder="0"
              className={`${inputCls} text-right tabular-nums text-lg font-semibold`}
            />
          </label>
        </MobileCard>

        <MobileCard className="space-y-3">
          <label className="block">
            <span className="text-xs text-text-muted">분류</span>
            <select
              id="card-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as PaymentCategory);
                setItem("");
                setCustomText("");
                setManualItem("");
              }}
              className={inputCls}
            >
              {PAYMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {items && (
            <label className="block">
              <span className="text-xs text-text-muted">항목</span>
              <select id="card-item" value={item} onChange={(e) => setItem(e.target.value)} className={inputCls}>
                <option value="">선택</option>
                {items.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
          )}
          {needsCustomText(category, item) && (
            <label className="block">
              <span className="text-xs text-text-muted">내용 직접 입력</span>
              <input id="card-custom" value={customText} onChange={(e) => setCustomText(e.target.value)} className={inputCls} />
            </label>
          )}
          {needsManualItem(category) && (
            <label className="block">
              <span className="text-xs text-text-muted">내용 (예: 사무용품 구입)</span>
              <input id="card-manual" value={manualItem} onChange={(e) => setManualItem(e.target.value)} className={inputCls} />
            </label>
          )}
          <label className="block">
            <span className="text-xs text-text-muted">사용처 (선택)</span>
            <input id="card-counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="가게·업체 이름" className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">메모 (선택)</span>
            <textarea id="card-memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className={inputCls} />
          </label>
        </MobileCard>

        <MobileCard className="space-y-3">
          <p className="text-xs text-text-muted">영수증 사진</p>
          {photoUrl ? (
            <div className="relative">
              <img src={photoUrl} alt="영수증 미리보기" className="w-full max-h-72 object-contain rounded-xl bg-bg" />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                aria-label="사진 빼기"
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-3 text-sm font-medium">
                <Camera size={18} />
                사진 찍기
              </button>
              <button type="button" onClick={() => albumRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-3 text-sm font-medium">
                <ImagePlus size={18} />
                앨범에서
              </button>
            </div>
          )}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={albumRef} type="file" accept="image/*" hidden onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </MobileCard>

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {done && (
          <p className="flex items-start gap-1.5 text-sm text-success" role="status">
            <Check size={16} className="mt-0.5 shrink-0" />
            {done}
          </p>
        )}
        <button type="submit" disabled={busy || !selected} className="w-full rounded-2xl bg-primary text-on-primary py-3.5 text-base font-semibold disabled:opacity-50">
          {busy ? "등록 중..." : "지출 등록"}
        </button>
      </form>

      <MobileCard>
        <h2 className="text-sm font-semibold mb-2">이번 달 최근 카드 사용</h2>
        {recent === null ? (
          <p className="text-xs text-text-muted">불러오는 중...</p>
        ) : recent.length === 0 ? (
          <p className="text-xs text-text-muted">이번 달 카드 사용 내역이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((p) => (
              <li key={p.id} className="py-2 flex items-center gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{p.description}</p>
                  <p className="text-xs text-text-muted truncate">
                    {p.payment_date} · {cardName(p.card_type)}
                    {p.client_name && ` · ${p.client_name}`}
                  </p>
                </div>
                <span className="tabular-nums font-medium">{formatCurrency(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </MobileCard>
    </MobileLayout>
  );
}
