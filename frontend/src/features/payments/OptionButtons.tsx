interface OptionButtonsProps<T extends string> {
  labels: Record<T, string>;
  value: T | null;
  onSelect: (value: T) => void;
  columns: 2 | 3;
}

const GRID_COLS = { 2: "grid-cols-2", 3: "grid-cols-3" } as const;

/** 입출금 화면의 버튼형 단일 선택(카드 종류, 계좌 종류, 증빙 발행 여부). 고른 버튼만 파란색으로 표시한다. */
export function OptionButtons<T extends string>({ labels, value, onSelect, columns }: OptionButtonsProps<T>) {
  return (
    <div className={`grid ${GRID_COLS[columns]} gap-2`}>
      {(Object.keys(labels) as T[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className={`rounded-lg border px-4 py-2.5 text-sm transition-colors ${
            value === option
              ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
              : "border-border text-text-muted hover:bg-bg"
          }`}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}
