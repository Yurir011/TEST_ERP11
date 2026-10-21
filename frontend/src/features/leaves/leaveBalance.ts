// 연차 잔여 표시 도우미 (계산은 서버가 한다)

/** 일수 표기: 기본은 부호를 붙여 "+2일"/"-1일"(0 은 "0일"), showPlus=false 면 양수에는 "+"를 붙이지 않는다 (잔여처럼 마이너스만 눈에 띄게) */
export function formatSignedDays(days: number, showPlus = true): string {
  if (days > 0 && showPlus) return `+${days}일`;
  return `${days}일`;
}

/** 입사일부터 오늘까지의 근속 "2년 3개월" / "5개월" / "1개월 미만" */
export function formatServiceLength(hireDate: string, today: Date = new Date()): string {
  const [y, m, d] = hireDate.split("-").map(Number);
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (today.getDate() < d) months -= 1;
  if (months < 1) return "1개월 미만";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest}개월`;
  return rest === 0 ? `${years}년` : `${years}년 ${rest}개월`;
}
