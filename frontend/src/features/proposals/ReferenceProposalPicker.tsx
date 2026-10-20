import { BookOpen } from "lucide-react";
import type { Proposal } from "./types";

interface ReferenceProposalPickerProps {
  /** 고를 수 있는 품의서 (승인된 구매 품의서) */
  options: Proposal[];
  /** 고른 품의서 번호 (고르지 않았으면 null) */
  value: number | null;
  onChange: (id: number | null) => void;
  /** 참조 패널이 열려 있는가 */
  open: boolean;
  onToggle: () => void;
}

/**
 * 품의서와 연결되지 않은 일반 발주서를 쓸 때, 근거가 되는 승인된 구매 품의서를 골라 오른쪽 참조 패널로 보는 선택 칸.
 * 참조만 하며 발주서와 연결하지는 않는다(결재 방식도 그대로).
 */
export function ReferenceProposalPicker({ options, value, onChange, open, onToggle }: ReferenceProposalPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg px-4 py-3">
      <label htmlFor="reference-proposal" className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
        <BookOpen size={14} />
        참조할 품의서
      </label>
      <select
        id="reference-proposal"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="min-w-[220px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      >
        <option value="">선택 안 함</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title} · {p.issue_date} · {p.doc_no}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onToggle}
        disabled={value === null}
        className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {open ? "참조 닫기" : "품의서 참조"}
      </button>
    </div>
  );
}
