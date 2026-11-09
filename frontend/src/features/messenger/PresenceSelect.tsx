import { STATUS_OPTIONS, isPresenceStatus, statusDotClass, statusLabel } from "./presence";
import { useMessenger } from "./useMessenger";
import { usePresenceChange } from "./usePresenceChange";

/**
 * 내 상태를 바꾸는 콤보박스 (메신저 오른쪽 위). 고른 상태는 그날 하루 유지되고 모두에게 보인다.
 * '출근'·'퇴근'을 고르면 근태 기록(출근·퇴근 시각)도 함께 남긴다(예전 출퇴근 토글과 같은 규칙). 서버가 출근을 기록하면 상태를 '출근'으로
 * 바꾸므로 그 변화는 실시간으로 이 콤보박스에도 반영된다. 그 밖의 상태(회의중·식사중·외근 등)는 상태만 바꾼다.
 */
export function PresenceSelect() {
  const { myStatus, changeMyStatus } = useMessenger();
  const { busy, change: onChange } = usePresenceChange(changeMyStatus);

  const value = myStatus ?? "";
  // 출근 전의 '미출근'은 고르는 값이 아니라 현재 값으로만 보여 준다
  const showCurrentOnly = myStatus !== null && !STATUS_OPTIONS.some((o) => o.value === myStatus);

  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      <span className={`w-2.5 h-2.5 rounded-full ${myStatus ? statusDotClass(myStatus) : "bg-border"}`} aria-hidden />
      내 상태
      <select
        aria-label="내 상태"
        value={value}
        disabled={busy || myStatus === null}
        onChange={(e) => void onChange(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary disabled:opacity-60"
      >
        {myStatus === null && <option value="">불러오는 중...</option>}
        {showCurrentOnly && (
          <option value={myStatus} disabled>
            {isPresenceStatus(myStatus) ? statusLabel(myStatus) : myStatus}
          </option>
        )}
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
