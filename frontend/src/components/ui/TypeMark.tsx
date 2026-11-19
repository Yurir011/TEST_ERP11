/**
 * 입금·출금·매출·매입(과 이체·결제·환불·잔액조회) 구분 표시: 구분별 연한 색 원 안에 같은 색의 선 아이콘이 들어간다.
 * 입출금관리와 매입매출관리의 목록·상세에서 같은 모양으로 쓴다. 이름은 마우스를 올리면 뜨고(title), 화면 낭독용 이름(aria-label)으로 남긴다.
 * 색은 채도를 낮춘 뮤트 톤(index.css 의 --color-tm-*)이고, 원 바탕은 같은 색을 14% 섞은 흰색이다.
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

/** 아이콘·바탕에 쓰는 색 변수: 입금 세이지 초록, 출금 로즈, 매출 슬레이트, 매입 클레이, 이체 모브, 결제 청회색, 환불 샌드, 잔액조회 차콜 */
const TONE: Record<TypeMarkKind, string> = {
  deposit: "var(--color-tm-deposit)",
  withdrawal: "var(--color-tm-withdrawal)",
  sales: "var(--color-tm-sales)",
  purchase: "var(--color-tm-purchase)",
  transfer: "var(--color-tm-transfer)",
  payment: "var(--color-tm-payment)",
  refund: "var(--color-tm-refund)",
  balance: "var(--color-tm-balance)",
};

// 24x24 단순 선 아이콘: 입금=아래로 향한 화살표와 바, 출금=위로 향한 화살표와 바(바는 둘 다 아래), 매출=오르는 선, 매입=쇼핑백,
// 이체=좌우 화살표, 결제=카드, 환불=되돌리기 화살표, 잔액조회=막대
function Glyph({ kind }: { kind: TypeMarkKind }) {
  switch (kind) {
    case "deposit":
      return <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />;
    case "withdrawal":
      return <path d="M12 15V3M7 8l5-5 5 5M4 20h16" />;
    case "sales":
      return <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />;
    case "purchase":
      return (
        <>
          <path d="M6 8h12l1 12H5z" />
          <path d="M9 8a3 3 0 0 1 6 0" />
        </>
      );
    case "transfer":
      return <path d="M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4" />;
    case "payment":
      return (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <path d="M3 10.5h18M7 15h3" />
        </>
      );
    case "refund":
      return <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4 4v4.5h4.5" />;
    case "balance":
      return <path d="M5 20v-8M12 20V5M19 20v-5" />;
  }
}

export function TypeMark({ kind, className = "" }: { kind: TypeMarkKind; className?: string }) {
  const tone = TONE[kind];
  return (
    <span
      className={`inline-grid place-items-center w-8 h-8 rounded-full shrink-0 ${className}`}
      style={{
        color: tone,
        backgroundColor: `color-mix(in srgb, ${tone} var(--tm-mix, 14%), var(--color-surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} var(--tm-ring, 0%), transparent)`,
      }}
      title={LABELS[kind]}
      role="img"
      aria-label={LABELS[kind]}
    >
      <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <Glyph kind={kind} />
      </svg>
    </span>
  );
}
