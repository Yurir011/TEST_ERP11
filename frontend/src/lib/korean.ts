/** 목적격 조사: 받침이 있으면 "을", 없으면 "를". 한글이 아니면 "을(를)" */
export function objectParticle(word: string): string {
  const last = word.trim().slice(-1);
  if (!last) return "을";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "을(를)";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL_UNITS = ["", "십", "백", "천"];
const BIG_UNITS = ["", "만", "억", "조"];

/** 금액을 한글로 읽는다: 222000000 → "이억이천이백만". 0 은 "영". 정수가 아니거나 너무 크면 null */
export function koreanNumber(n: number): string | null {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 10 ** 16) return null;
  if (n === 0) return "영";
  const groups: string[] = [];
  for (let g = 0; n > 0; g++, n = Math.floor(n / 10000)) {
    const part = n % 10000;
    if (part === 0) continue;
    let text = "";
    for (let p = 3; p >= 0; p--) {
      const d = Math.floor(part / 10 ** p) % 10;
      if (d === 0) continue;
      text += (d === 1 && p > 0 ? "" : DIGITS[d]) + SMALL_UNITS[p]; // 십·백·천 앞의 "일"은 읽지 않는다
    }
    groups.unshift(`${part === 1 ? "일" : text}${BIG_UNITS[g]}`);
  }
  return groups.join("");
}
