export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export function formatTime(isoString: string | null): string {
  if (!isoString) return "-";
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(isoString));
}

/** 퇴근을 누르지 않아 서버가 17:00(KST)으로 자동 처리한 퇴근인지 (시각이 정확히 17:00:00 인 경우) */
export function isAutoClockOut(isoString: string | null): boolean {
  if (!isoString) return false;
  const d = new Date(isoString);
  return d.getUTCHours() === 8 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

export function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "-";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms <= 0) return "-";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}시간 ${minutes}분`;
}
