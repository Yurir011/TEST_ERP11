/**
 * 입금·출금·매출·매입(과 이체·결제·환불·잔액조회) 구분 표시: 구분별 색 원(테두리 없음) 안에 남색 선 아이콘만 보인다.
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

/** 원 색: 입금 초록, 출금 빨강, 매출 파랑, 매입 주황, 이체 보라, 결제 청록, 환불 호박색, 잔액조회 회색 */
const CIRCLE: Record<TypeMarkKind, string> = {
  deposit: "bg-[color-mix(in_srgb,var(--color-tile-green-fg)_22%,var(--color-surface))]",
  withdrawal: "bg-[color-mix(in_srgb,var(--color-danger)_22%,var(--color-surface))]",
  sales: "bg-[color-mix(in_srgb,var(--color-tile-blue-fg)_22%,var(--color-surface))]",
  purchase: "bg-[color-mix(in_srgb,var(--color-tile-orange-fg)_22%,var(--color-surface))]",
  transfer: "bg-[color-mix(in_srgb,var(--color-tile-purple-fg)_22%,var(--color-surface))]",
  payment: "bg-[color-mix(in_srgb,var(--color-tile-teal-fg)_22%,var(--color-surface))]",
  refund: "bg-[color-mix(in_srgb,var(--color-tile-yellow-fg)_22%,var(--color-surface))]",
  balance: "bg-[color-mix(in_srgb,var(--color-text-muted)_22%,var(--color-surface))]",
};

const ICON_COLOR = "text-[color-mix(in_srgb,#12338a_60%,var(--color-text))]";

// 24x24 선 아이콘 (원 안을 꽉 채우도록 크게 그린다): 입금=은행과 위 화살표, 출금=지갑, 매출=문서와 오르는 선, 매입=장바구니와 아래 화살표,
// 이체=좌우 화살표, 결제=카드와 ₩, 환불=순환 화살표, 잔액조회=막대 그래프 문서와 계산기
function Glyph({ kind }: { kind: TypeMarkKind }) {
  switch (kind) {
    case "deposit":
      return (
        <>
          <path d="M2.5 9L11 4l8.5 5z" />
          <path d="M5 12v5M9 12v5M13 12v5M17 12v5" />
          <path d="M2.5 20h14M3.5 17.5h13" />
          <path d="M21 19v-6M18.5 15.5L21 13l2.5 2.5" />
        </>
      );
    case "withdrawal":
      return (
        <>
          <rect x="3" y="8" width="18" height="12" rx="3" />
          <path d="M5 8l9-4.2 2 1.6M17 14h2.5" />
        </>
      );
    case "sales":
      return (
        <>
          <path d="M14 3H8a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3" />
          <path d="M14 3l5 5h-3.5A1.5 1.5 0 0 1 14 6.5z" />
          <path d="M8.5 10h4M8.5 13.5h3" />
          <path d="M11.5 19l3.5-3.5 2 2 4-4.5M18 12.8h3.2V16" />
        </>
      );
    case "purchase":
      return (
        <>
          <path d="M1.5 3h3l2.6 12.5h11.8L21 6H5.8" />
          <circle cx="9" cy="20" r="1.6" />
          <circle cx="17.5" cy="20" r="1.6" />
          <rect x="10.6" y="7.6" width="5.8" height="5" rx=".8" />
          <path d="M13.5 8.8v2.4M12.3 10.2l1.2 1.2 1.2-1.2" />
        </>
      );
    case "transfer":
      return (
        <>
          <path d="M3 8h17M16 4l4 4-4 4" />
          <path d="M21 16H4M8 12l-4 4 4 4" />
        </>
      );
    case "payment":
      return (
        <>
          <rect x="2" y="5" width="18" height="12" rx="2.5" />
          <path d="M2 9h18M5.5 13h4" />
          <circle cx="18" cy="17.5" r="4.5" />
          <path d="M15.6 15.5l1 4 1.4-3 1.4 3 1-4M15.2 17h5.6" />
        </>
      );
    case "refund":
      return (
        <>
          <path d="M20 12a8 8 0 0 1-13.5 5.8M4 12a8 8 0 0 1 13.5-5.8" />
          <path d="M17.5 3v3.5H14M6.5 21v-3.5H10" />
        </>
      );
    case "balance":
      return (
        <>
          <path d="M17 12V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h6" />
          <path d="M7 15v-4M10 15V8M13 15v-3M6.5 17.5H12" />
          <rect x="14" y="13" width="7" height="8" rx="1.2" />
          <path d="M15.8 15.5h3.4M16 18h.01M18 18h.01M16 20h.01M18 20h.01" />
        </>
      );
  }
}

export function TypeMark({ kind, className = "" }: { kind: TypeMarkKind; className?: string }) {
  return (
    <span
      className={`inline-grid place-items-center w-7 h-7 rounded-full shrink-0 ${CIRCLE[kind]} ${ICON_COLOR} ${className}`}
      title={LABELS[kind]}
      role="img"
      aria-label={LABELS[kind]}
    >
      <svg viewBox="0 0 24 24" className="w-[23px] h-[23px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <Glyph kind={kind} />
      </svg>
    </span>
  );
}
