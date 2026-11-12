/**
 * 단위값 환산 검색: "100nF" 로 찾으면 "0.1uF", "0.1µF", "100,000pF" 로 적힌 자재도 같은 값으로 보고 찾는다.
 * 숫자 + (접두어) + 단위(F·H·Ω·Hz·V·A·W)를 기본 단위 값으로 바꿔 비교한다. 단위 없이 "10k"·"4k7" 로 적은 저항도 Ω 으로 본다.
 * 접두어: p(1e-12) n(1e-9) u·µ·μ(1e-6) m(1e-3) k(1e3) M(1e6) G(1e9). m 과 M 은 대소문자로 구별한다.
 */
const PREFIX: Record<string, number> = { p: 1e-12, P: 1e-12, n: 1e-9, N: 1e-9, u: 1e-6, U: 1e-6, "µ": 1e-6, "μ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
const UNIT: Record<string, string> = { f: "F", h: "H", "ω": "Ω", ohm: "Ω", 옴: "Ω", hz: "Hz", v: "V", a: "A", w: "W" };

// 앞뒤에 영문·숫자가 붙어 있으면(예: STM32F103) 단위로 보지 않는다
const WITH_UNIT = /(?<![A-Za-z0-9.])(\d+(?:\.\d+)?)\s*([pnuµμPNUkKmMG])?\s*(Ω|ohm|옴|Hz|hz|[FfHhVvAaWw])(?![A-Za-z0-9Ωµμ])/gi;
const K_SPLIT = /(?<![A-Za-z0-9.])(\d+)[kK](\d+)(?![A-Za-z0-9])/g; // 4k7 → 4.7kΩ
const K_ONLY = /(?<![A-Za-z0-9.])(\d+(?:\.\d+)?)\s*[kK](?![A-Za-z0-9Ωµμ])/g; // 10k → 10kΩ

function keyOf(unit: string, value: number): string {
  return `${unit}:${Number(value.toPrecision(9))}`;
}

/** 글에서 찾은 값들의 키 목록과, 그 값 표기를 지운 나머지 글 */
export function extractQuantities(text: string): { keys: Set<string>; rest: string } {
  const keys = new Set<string>();
  let rest = text;
  rest = rest.replace(WITH_UNIT, (_m, num: string, prefix: string | undefined, unitRaw: string) => {
    const unit = UNIT[unitRaw.toLowerCase()] ?? UNIT[unitRaw];
    if (!unit) return _m;
    // 접두어가 대문자 M 이 아닌데 단위가 소문자 하나(m 등)와 헷갈리는 경우는 없다 (m 은 단위 목록에 없음)
    const factor = prefix ? (PREFIX[prefix] ?? 1) : 1;
    keys.add(keyOf(unit, Number(num) * factor));
    return " ";
  });
  rest = rest.replace(K_SPLIT, (_m, a: string, b: string) => {
    keys.add(keyOf("Ω", Number(`${a}.${b}`) * 1e3));
    return " ";
  });
  rest = rest.replace(K_ONLY, (_m, num: string) => {
    keys.add(keyOf("Ω", Number(num) * 1e3));
    return " ";
  });
  return { keys, rest };
}

/**
 * 검색어가 글(haystack)에 들어 있는가. 글자 그대로 들어 있으면 당연히 맞고,
 * 아니면 검색어의 단위값이 모두 글 속 값에 있고 나머지 낱말도 글에 있으면 맞다.
 */
export function matchesWithUnits(haystack: string, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const hay = haystack.toLowerCase();
  if (hay.includes(q)) return true;
  const query = extractQuantities(keyword.trim());
  if (query.keys.size === 0) return false;
  const have = extractQuantities(haystack).keys;
  for (const k of query.keys) if (!have.has(k)) return false;
  return query.rest
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}
