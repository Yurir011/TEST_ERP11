/**
 * 입금·출금·매출·매입(과 이체·결제·환불·잔액조회) 구분 표시: 구분별 색 둥근 네모(테두리 없음) 안에 남색 선 아이콘만 보인다.
 * 입출금관리와 매입매출관리의 목록·상세에서 같은 모양으로 쓴다. 이름은 마우스를 올리면 뜨고(title), 화면 낭독용 이름(aria-label)으로 남긴다.
 * 그림 색은 어두운 남색에 본문 글자색을 섞어, 밝은 테마에서는 남색, 어두운 테마에서는 밝은 파랑으로 보이게 한다.
 * Tailwind가 클래스를 소스에서 그대로 찾기 때문에 색마다 전체 문자열을 적어 두었다.
 */
export type TypeMarkKind = "deposit" | "withdrawal" | "sales" | "purchase" | "transfer" | "payment" | "refund" | "balance";

const LABELS: Record<TypeMarkKind, string> = {
  deposit: "입금",
  withdrawal: "출금",
  sales: "매출",
  purchase: "매입",
  transfer: "이체",
  payment: "결제",
  refund: "환불",
  balance: "잔액조회",
};

/** 바탕 색: 입금 초록, 출금 빨강, 매출 파랑, 매입 주황, 이체 보라, 결제 청록, 환불 호박색, 잔액조회 회색 */
const CIRCLE: Record<TypeMarkKind, string> = {
  deposit: "bg-[color-mix(in_srgb,var(--color-tile-green-fg)_20%,var(--color-surface))]",
  withdrawal: "bg-[color-mix(in_srgb,var(--color-danger)_20%,var(--color-surface))]",
  sales: "bg-[color-mix(in_srgb,var(--color-tile-blue-fg)_20%,var(--color-surface))]",
  purchase: "bg-[color-mix(in_srgb,var(--color-tile-orange-fg)_20%,var(--color-surface))]",
  transfer: "bg-[color-mix(in_srgb,var(--color-tile-purple-fg)_20%,var(--color-surface))]",
  payment: "bg-[color-mix(in_srgb,var(--color-tile-teal-fg)_20%,var(--color-surface))]",
  refund: "bg-[color-mix(in_srgb,var(--color-tile-yellow-fg)_20%,var(--color-surface))]",
  balance: "bg-[color-mix(in_srgb,var(--color-text-muted)_20%,var(--color-surface))]",
};

const ICON_COLOR = "text-[color-mix(in_srgb,#12338a_60%,var(--color-text))]";

// 24x24 단순 선 아이콘: 입금=은행과 들어오는 화살표, 출금=지갑과 오른쪽으로 나가는 화살표, 매출=문서와 글줄 두 줄,
// 매입=장바구니, 이체=좌우 화살표, 결제=카드, 환불=되돌리기 화살표, 잔액조회=막대 그래프
function Glyph({ kind }: { kind: TypeMarkKind }) {
  switch (kind) {
    case "deposit":
      return (
        <>
          <path d="M10 7l8 4.5H2z" />
          <path d="M4.5 14.5v4M8 14.5v4M12 14.5v4M15.5 14.5v4M2 21h16" />
          <path d="M20.5 2v8M17.5 7l3 3 3-3" />
        </>
      );
    case "withdrawal":
      return (
        <>
          <path d="M2 12a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
          <path d="M20 14h-3a1.5 1.5 0 0 0 0 3h3" />
          <path d="M8 4h14M18 1l4 3-4 3" />
        </>
      );
    case "sales":
      return (
        <>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M8 13h8M8 17h8" />
        </>
      );
    case "purchase":
      return (
        <>
          <circle cx="8" cy="21" r="1" />
          <circle cx="19" cy="21" r="1" />
          <path d="M2 2h2l2.7 12.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L22 7H5" />
        </>
      );
    case "transfer":
      return <path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />;
    case "payment":
      return (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </>
      );
    case "refund":
      return (
        <>
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </>
      );
    case "balance":
      return (
        <>
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <path d="M18 17V9M13 17V5M8 17v-3" />
        </>
      );
  }
}

export function TypeMark({ kind, className = "" }: { kind: TypeMarkKind; className?: string }) {
  return (
    <span
      className={`inline-grid place-items-center w-9 h-9 rounded-[10px] shrink-0 ${CIRCLE[kind]} ${ICON_COLOR} ${className}`}
      title={LABELS[kind]}
      role="img"
      aria-label={LABELS[kind]}
    >
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <Glyph kind={kind} />
      </svg>
    </span>
  );
}
