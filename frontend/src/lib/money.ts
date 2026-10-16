// 금액 계산 공통 함수 — 서버(backend/app/services/money.py)와 같은 규칙으로 계산한다.
//
// 반올림은 사사오입(0.5는 항상 올림, 음수는 0에서 먼 쪽)이다. 15 × 4.1 이 61.49999… 가 되는 것처럼
// 소수(float) 곱셈은 0.5 경계에서 틀리므로, 숫자를 문자열 그대로 정수(BigInt)로 바꿔 정확히 계산한다.

/** 숫자를 (정수, 소수 자릿수)로. 예: 4.1 → (41n, 1) */
function toScaled(value: number): [bigint, number] {
  if (!Number.isFinite(value)) return [0n, 0];
  let text = String(value);
  if (/e/i.test(text)) text = value.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
  const negative = text.startsWith("-");
  const [intPart, fracPart = ""] = (negative ? text.slice(1) : text).split(".");
  const digits = BigInt(intPart + fracPart);
  return [negative ? -digits : digits, fracPart.length];
}

/** value / 10^scale 을 원 단위로 사사오입 */
function roundScaled(value: bigint, scale: number): number {
  if (scale === 0) return Number(value);
  const unit = 10n ** BigInt(scale);
  const abs = value < 0n ? -value : value;
  const rounded = (abs + unit / 2n) / unit;
  return Number(value < 0n ? -rounded : rounded);
}

/** 원 단위 사사오입 반올림 */
export function roundHalfUp(value: number): number {
  const [v, s] = toScaled(value);
  return roundScaled(v, s);
}

/** 품목 금액 = 수량 × 단가 (원 단위, 사사오입). 단가가 소수(예: 454,545.5)일 수 있다. */
export function lineAmount(quantity: number, unitPrice: number): number {
  const [q, qs] = toScaled(quantity);
  const [p, ps] = toScaled(unitPrice);
  return roundScaled(q * p, qs + ps);
}

/** 공급가액에 대한 부가세 10% (원 단위, 사사오입) */
export function vatAmount(supply: number): number {
  const [v, s] = toScaled(supply);
  return roundScaled(v, s + 1);
}
