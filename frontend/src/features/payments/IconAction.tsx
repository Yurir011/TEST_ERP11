import type { ReactNode } from "react";

interface IconActionProps {
  /** 마우스를 올리면 뜨는 이름 (스크린리더용 이름도 겸한다) */
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  /** 아이콘 모서리에 붙는 건수 배지 */
  badge?: number;
}

/** 입출금관리 상단의 아이콘 버튼: 글자 대신 아이콘만 보이고, 마우스를 올리거나 키보드로 focus 하면 이름이 뜬다. */
export function IconAction({ label, onClick, children, disabled, badge }: IconActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="group relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-1.5 -top-1.5 rounded-full border border-surface bg-tile-orange px-1.5 text-[10px] font-bold leading-4 text-tile-orange-fg">{badge}</span>
      )}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-[11px] text-bg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}
