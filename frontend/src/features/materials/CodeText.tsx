/** 품목 코드 대분류(앞 두 글자) 색: 회로부품 전용 EC 파랑 · 범용 EG 청록 · 사출물 ME 보라 · 부자재 SU 초록 · 포장재 PK 주황 · 소모품 CS 회색. */
const PREFIX_COLORS: Record<string, string> = {
  EC: "#2563eb",
  EG: "#0891b2",
  ME: "#7c3aed",
  SU: "#16a34a",
  PK: "#d97706",
  CS: "#6b7280",
};

/** 코드를 앞 대분류와 나머지로 나눈다: "EC-0001-A12" → ["EC", "0001-A12"]. 하이픈이 없으면 앞 두 글자를 대분류로 본다. */
export function splitCode(code: string): [string, string] {
  const i = code.indexOf("-");
  return i > 0 ? [code.slice(0, i), code.slice(i + 1)] : [code.slice(0, 2), code.slice(2)];
}

/** 품목 코드 표시: 대분류만 색 블록 안에 흰 글자로, 나머지는 기본 글자색 고정폭. 긴 코드도 줄바꿈 없이 한 줄로 둔다. */
export function CodeText({ code, small = false, className = "" }: { code: string; small?: boolean; className?: string }) {
  const [prefix, rest] = splitCode(code);
  return (
    <span className={`font-mono whitespace-nowrap ${small ? "text-[11px]" : "text-[13px]"} ${className}`} title={code}>
      <b
        data-testid="code-prefix"
        style={{ background: PREFIX_COLORS[prefix] ?? "#6b7280" }}
        className={`inline-block rounded text-white font-extrabold align-baseline leading-[1.35] mr-1 ${small ? "px-2" : "px-2.5"}`}
      >
        {prefix}
      </b>
      <span className="sr-only">-</span>
      {rest}
    </span>
  );
}

/** 코드 미리보기용: 앞으로 붙을 대분류(EC 등)만 색 블록으로. */
export function PrefixBadge({ prefix }: { prefix: string }) {
  return (
    <b style={{ background: PREFIX_COLORS[prefix] ?? "#6b7280" }} className="inline-block rounded text-white font-extrabold font-mono text-xs px-2.5 py-0.5">
      {prefix}
    </b>
  );
}

/** 항목(+회로부품은 종류)에서 코드 대분류를 정한다. 서버 CODE_PREFIXES 와 같다. 정하지 못하면(회로부품에서 종류를 안 골랐을 때) null. */
export function prefixFor(category: string, kind: string | null): string | null {
  if (category === "ic") return kind === "dedicated" ? "EC" : kind === "general" ? "EG" : null;
  return { injection: "ME", subsidiary: "SU", packaging: "PK", consumable: "CS" }[category] ?? null;
}
