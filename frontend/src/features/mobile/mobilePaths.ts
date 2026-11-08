/** PC 화면 경로로 저장된 알림 링크를 모바일 화면 경로로 바꾼다. 알 수 없는 경로면 null. (알림 목록과 푸시 알림 탭 이동이 함께 쓴다) */
export function toMobilePath(link: string | null | undefined): string | null {
  if (!link) return null;
  if (link.startsWith("/m/")) return link; // 이미 모바일 경로
  if (link.startsWith("/leaves")) return "/m/leaves";
  if (link.startsWith("/project-documents") || link.startsWith("/documents") || link.startsWith("/approval") || link.startsWith("/proposals")) {
    return "/m/approvals";
  }
  if (link.startsWith("/notices")) return "/m/notices";
  if (link.startsWith("/schedule")) return "/m/schedule";
  return null;
}
