/**
 * 입금·출금·매출·매입 구분 표시: 색 원 안에 단순한 선 아이콘만 보인다 (시안 3에서 글자를 뺀 모양).
 * 입출금관리와 매입매출관리의 목록·상세에서 같은 모양으로 쓴다. 이름은 마우스를 올리면 뜨고(title), 화면 낭독용 이름(aria-label)으로 남긴다.
 * Tailwind가 클래스를 소스에서 그대로 찾기 때문에 색마다 전체 문자열을 적어 두었다.
 */
export type TypeMarkKind = "deposit" | "withdrawal" | "sales" | "purchase";

const LABELS: Record<TypeMarkKind, string> = {
  deposit: "입금",
  withdrawal: "출금",
  sales: "매출",
  purchase: "매입",
};

const CIRCLE: Record<TypeMarkKind, string> = {
  deposit: "bg-[color-mix(in_srgb,var(--color-tile-green)_70%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-tile-green-fg)_72%,var(--color-text))]",
  withdrawal: "bg-[color-mix(in_srgb,var(--color-tile-red)_70%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-danger)_72%,var(--color-text))]",
  sales: "bg-[color-mix(in_srgb,var(--color-tile-blue)_70%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-tile-blue-fg)_72%,var(--color-text))]",
  purchase: "bg-[color-mix(in_srgb,var(--color-tile-orange)_70%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-tile-orange-fg)_72%,var(--color-text))]",
};

// 24x24 선 아이콘: 입금=받침대 위로 내려놓기, 출금=받침대에서 꺼내기, 매출=가격표, 매입=장바구니
function Glyph({ kind }: { kind: TypeMarkKind }) {
  switch (kind) {
    case "deposit":
      return (
        <>
          <path d="M4 15v4h16v-4" />
          <path d="M12 4v10" />
          <path d="M8 10l4 4 4-4" />
        </>
      );
    case "withdrawal":
      return (
        <>
          <path d="M4 15v4h16v-4" />
          <path d="M12 14V4" />
          <path d="M8 8l4-4 4 4" />
        </>
      );
    case "sales":
      return (
        <>
          <path d="M3 12.5V4h8.5L21 13.5 13.5 21z" />
          <circle cx="7.6" cy="8.4" r="1.2" />
        </>
      );
    case "purchase":
      return (
        <>
          <path d="M3 4h2l2.2 11h10.3l2-8H6.5" />
          <circle cx="9" cy="19.2" r="1.2" />
          <circle cx="17" cy="19.2" r="1.2" />
        </>
      );
  }
}

export function TypeMark({ kind, className = "" }: { kind: TypeMarkKind; className?: string }) {
  return (
    <span
      className={`inline-grid place-items-center w-6 h-6 rounded-full shrink-0 ${CIRCLE[kind]} ${className}`}
      title={LABELS[kind]}
      role="img"
      aria-label={LABELS[kind]}
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <Glyph kind={kind} />
      </svg>
    </span>
  );
}
