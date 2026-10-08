import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import {
  BANK_TYPE_LABELS,
  PAYMENT_CATEGORIES,
  PAYMENT_CATEGORY_ITEMS,
  PAYMENT_TYPE_LABELS,
  type BankType,
  type PaymentCategory,
  type PaymentType,
  type RecurringPayment,
} from "./types";

interface FormState {
  type: PaymentType;
  category: PaymentCategory;
  description: string;
  amount: string;
  dayOfMonth: string;
  startMonth: string; // "YYYY-MM"
  bankType: BankType;
  memo: string;
  isActive: boolean;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function emptyForm(): FormState {
  return {
    type: "withdrawal",
    category: "공과금",
    description: "",
    amount: "",
    dayOfMonth: "25",
    startMonth: currentMonth(),
    bankType: "ibk",
    memo: "",
    isActive: true,
  };
}

function toForm(t: RecurringPayment): FormState {
  return {
    type: t.type,
    category: (PAYMENT_CATEGORIES as readonly string[]).includes(t.category) ? (t.category as PaymentCategory) : "기타",
    description: t.description,
    amount: String(t.amount),
    dayOfMonth: String(t.day_of_month),
    startMonth: t.start_month.slice(0, 7),
    bankType: t.bank_type,
    memo: t.memo ?? "",
    isActive: t.is_active,
  };
}

const inputClass = "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg";

export function RecurringPaymentsModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<RecurringPayment[] | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; form: FormState } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    logDebug("RecurringPayments", "정기 자동이체 목록 조회");
    apiGet<RecurringPayment[]>("/api/recurring-payments")
      .then((list) => {
        setItems(list);
        onChanged(); // 목록 조회 시 도래한 월분이 기록될 수 있으므로 입출금 목록도 새로 불러온다.
      })
      .catch((err) => {
        logError("RecurringPayments", "목록 조회 실패", err);
        setError("정기 자동이체 목록을 불러오지 못했습니다.");
        setItems([]);
      });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    const f = editing.form;
    const body = {
      type: f.type,
      category: f.category,
      description: f.description.trim(),
      amount: Number(f.amount),
      day_of_month: Number(f.dayOfMonth),
      start_month: `${f.startMonth}-01`,
      bank_type: f.bankType,
      memo: f.memo.trim() || null,
      is_active: f.isActive,
    };
    setIsSaving(true);
    try {
      logDebug("RecurringPayments", `${editing.id ? "수정" : "등록"} 시도: ${body.description}, 매월 ${body.day_of_month}일`);
      if (editing.id) {
        await apiPut(`/api/recurring-payments/${editing.id}`, body);
      } else {
        await apiPost("/api/recurring-payments", body);
      }
      setEditing(null);
      load();
    } catch (err) {
      logError("RecurringPayments", "저장 실패", err);
      setError(err instanceof ApiError ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(t: RecurringPayment) {
    try {
      await apiPut(`/api/recurring-payments/${t.id}`, {
        type: t.type,
        category: t.category,
        description: t.description,
        amount: t.amount,
        day_of_month: t.day_of_month,
        start_month: t.start_month,
        bank_type: t.bank_type,
        memo: t.memo,
        is_active: !t.is_active,
      });
      load();
    } catch (err) {
      logError("RecurringPayments", "사용 여부 변경 실패", err);
      setError(err instanceof ApiError ? err.message : "변경하지 못했습니다.");
    }
  }

  async function handleDelete(t: RecurringPayment) {
    if (!window.confirm(`"${t.description}" 정기 자동이체를 삭제할까요?\n이미 기록된 입출금 내역은 그대로 남습니다.`)) return;
    try {
      await apiDelete(`/api/recurring-payments/${t.id}`);
      load();
    } catch (err) {
      logError("RecurringPayments", "삭제 실패", err);
      setError("삭제하지 못했습니다.");
    }
  }

  function patch(p: Partial<FormState>) {
    setEditing((cur) => (cur ? { ...cur, form: { ...cur.form, ...p } } : cur));
  }

  const suggestions = editing ? PAYMENT_CATEGORY_ITEMS[editing.form.category] : undefined;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">정기 자동이체</h3>
          <button onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">
          매월 정해진 날에 빠져나가는 항목을 등록하면, 그 날짜가 되었을 때 입출금 내역(계좌이체)으로 자동 기록됩니다. 금액이 달라진 달은 기록된
          내역을 따로 수정하세요.
        </p>

        {error && <p className="text-xs text-danger mb-3">{error}</p>}

        {editing ? (
          <form onSubmit={handleSubmit} className="space-y-3 border border-border rounded-xl p-4 bg-bg">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">구분</label>
                <select value={editing.form.type} onChange={(e) => patch({ type: e.target.value as PaymentType })} className={inputClass}>
                  {(Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map((t) => (
                    <option key={t} value={t}>
                      {PAYMENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">분류</label>
                <select
                  value={editing.form.category}
                  onChange={(e) => patch({ category: e.target.value as PaymentCategory, description: "" })}
                  className={inputClass}
                >
                  {PAYMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">내용</label>
              <input
                required
                list="recurring-description-options"
                value={editing.form.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="예: 사무실 임대료, 인터넷 요금"
                className={inputClass}
              />
              {suggestions && (
                <datalist id="recurring-description-options">
                  {suggestions.filter((s) => s !== "기타").map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">금액</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={editing.form.amount}
                  onChange={(e) => patch({ amount: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">매월 이체일</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    required
                    value={editing.form.dayOfMonth}
                    onChange={(e) => patch({ dayOfMonth: e.target.value })}
                    className={inputClass}
                  />
                  <span className="text-sm text-text-muted shrink-0">일</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">계좌 종류</label>
                <select value={editing.form.bankType} onChange={(e) => patch({ bankType: e.target.value as BankType })} className={inputClass}>
                  {(Object.keys(BANK_TYPE_LABELS) as BankType[]).map((b) => (
                    <option key={b} value={b}>
                      {BANK_TYPE_LABELS[b]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">시작 월</label>
                <input
                  type="month"
                  required
                  value={editing.form.startMonth}
                  onChange={(e) => patch({ startMonth: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">메모 (선택)</label>
              <input value={editing.form.memo} onChange={(e) => patch({ memo: e.target.value })} className={inputClass} />
            </div>
            <p className="text-xs text-text-muted">
              31일처럼 그 달에 없는 날짜는 말일에 기록됩니다. 시작 월이 지난 달이면 이미 지난 달분도 한꺼번에 기록됩니다.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
              >
                {isSaving ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setError(null);
                }}
                className="rounded-lg border border-border text-sm text-text-muted px-4 py-2 hover:bg-surface"
              >
                취소
              </button>
            </div>
          </form>
        ) : (
          <>
            {items === null ? (
              <p className="text-sm text-text-muted py-6 text-center">불러오는 중...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-text-muted py-6 text-center">등록된 정기 자동이체가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((t) => (
                  <li key={t.id} className={`border border-border rounded-xl px-4 py-3 ${t.is_active ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold break-words">{t.description}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {t.category} · 매월 {t.day_of_month}일 · {BANK_TYPE_LABELS[t.bank_type]} · {t.start_month.slice(0, 7)}부터
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {t.last_recorded_month ? `최근 기록: ${t.last_recorded_month}` : "아직 기록된 내역 없음"}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(t.amount)}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(t)}
                        className={`text-xs rounded-full px-2.5 py-1 ${
                          t.is_active ? "bg-tile-green text-tile-green-fg" : "bg-bg text-text-muted border border-border"
                        }`}
                      >
                        {t.is_active ? "사용 중" : "중지됨"}
                      </button>
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => {
                          setEditing({ id: t.id, form: toForm(t) });
                          setError(null);
                        }}
                        aria-label="수정"
                        className="p-1.5 text-text-muted hover:text-text"
                      >
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => handleDelete(t)} aria-label="삭제" className="p-1.5 text-text-muted hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                setEditing({ id: null, form: emptyForm() });
                setError(null);
              }}
              className="mt-4 flex items-center gap-1.5 text-sm border border-border rounded-lg px-4 py-2 hover:bg-bg"
            >
              <Plus size={15} />
              정기 자동이체 추가
            </button>
          </>
        )}
      </div>
    </div>
  );
}
