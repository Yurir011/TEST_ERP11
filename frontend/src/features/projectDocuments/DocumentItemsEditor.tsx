import { Plus, Trash2 } from "lucide-react";
import { NumberInput } from "../../components/ui/NumberInput";
import { formItemAmount, formTotals } from "./documentForm";
import {
  DOC_CURRENCY_LABELS,
  DOC_CURRENCY_SYMBOLS,
  MAX_PROJECT_DOC_ITEMS,
  type DocCurrency,
  type ProjectDocumentItemFormValues,
} from "./types";

const CURRENCY_OPTIONS: DocCurrency[] = ["KRW", "USD", "JPY"];

interface DocumentItemsEditorProps {
  items: ProjectDocumentItemFormValues[];
  currency: DocCurrency;
  /** 없으면 단가 단위 선택을 숨긴다 (세금계산서는 원화만) */
  onCurrencyChange: ((c: DocCurrency) => void) | null;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, key: keyof ProjectDocumentItemFormValues, value: string) => void;
}

/** 문서 작성 화면의 품목 입력 목록 + 공급가액·부가세·합계 */
export function DocumentItemsEditor({ items, currency, onCurrencyChange, onAdd, onRemove, onUpdate }: DocumentItemsEditorProps) {
  // 품목 금액 = 수량 x 단가 (원 단위 반올림), 부가세 10%. 서버가 문서를 만들 때 쓰는 계산과 같다.
  const symbol = DOC_CURRENCY_SYMBOLS[currency];
  const formatMoney = (n: number) => `${symbol}${n.toLocaleString()}`;
  const { subtotal: subtotalAmount, vat: vatAmount, total: totalAmount } = formTotals(items);

  return (
    <div className="pt-2 border-t border-border">
      <div className="flex items-center justify-between mb-2 mt-3">
        <label className="block text-xs text-text-muted">
          품목 ({items.length}/{MAX_PROJECT_DOC_ITEMS})
        </label>
        <div className="flex items-center gap-3">
          {onCurrencyChange && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-text-muted">단가 단위</label>
              <select
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value as DocCurrency)}
                className="rounded-lg border border-border px-2 py-1 text-xs outline-none focus:border-primary bg-bg"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {DOC_CURRENCY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={onAdd}
            disabled={items.length >= MAX_PROJECT_DOC_ITEMS}
            className="flex items-center gap-1 text-xs text-primary hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            항목 추가
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="bg-bg rounded-xl p-3 relative">
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute top-2 right-2 text-text-muted hover:text-danger"
                title="항목 삭제"
              >
                <Trash2 size={14} />
              </button>
            )}
            <p className="text-[11px] text-text-muted mb-2">품목 {index + 1}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] text-text-muted mb-1">내용</label>
                <input
                  required
                  value={item.content}
                  onChange={(e) => onUpdate(index, "content", e.target.value)}
                  className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">수량</label>
                <NumberInput
                  required
                  value={item.quantity}
                  onChange={(v) => onUpdate(index, "quantity", v)}
                  className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">단가 ({DOC_CURRENCY_SYMBOLS[currency]})</label>
                <NumberInput
                  allowDecimal
                  required
                  value={item.unit_price}
                  onChange={(v) => onUpdate(index, "unit_price", v)}
                  className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-text-muted mb-1">비고</label>
                <input
                  value={item.note}
                  onChange={(e) => onUpdate(index, "note", e.target.value)}
                  className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                />
              </div>
              <div className="col-span-2 flex items-center justify-between text-xs pt-1">
                <span className="text-text-muted">금액 (수량 × 단가)</span>
                <span className="font-medium tabular-nums">{formatMoney(formItemAmount(item))}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-bg px-4 py-3 space-y-1.5 text-sm" aria-label="총금액">
        <div className="flex items-center justify-between">
          <span className="text-text-muted">공급가액</span>
          <span className="tabular-nums">{formatMoney(subtotalAmount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-muted">부가세 (10%)</span>
          <span className="tabular-nums">{formatMoney(vatAmount)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 mt-1">
          <span className="font-semibold">총금액 (합계)</span>
          <span className="text-base font-semibold tabular-nums text-primary">{formatMoney(totalAmount)}</span>
        </div>
      </div>
    </div>
  );
}
