import { statusDotClass, statusLabel } from "./presence";

/** 현재 상태를 색 점과 글자로 보여 준다 (출근·외근·출장·휴가 등) */
export function PresenceBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted shrink-0" title={`현재 상태: ${statusLabel(status)}`}>
      <span className={`w-2 h-2 rounded-full ${statusDotClass(status)}`} aria-hidden />
      {statusLabel(status)}
    </span>
  );
}
