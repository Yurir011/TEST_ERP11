/** 목적격 조사: 받침이 있으면 "을", 없으면 "를". 한글이 아니면 "을(를)" */
export function objectParticle(word: string): string {
  const last = word.trim().slice(-1);
  if (!last) return "을";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "을(를)";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}
