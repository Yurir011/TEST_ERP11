import { useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError } from "../../lib/api";
import { logError } from "../../lib/logger";
import { STATUS_OPTIONS, isPresenceStatus, statusDotClass, statusLabel } from "./presence";
import { useMessenger } from "./useMessenger";

/**
 * 내 상태를 바꾸는 콤보박스 (메신저 오른쪽 위). 고른 상태는 그날 하루 유지되고 모두에게 보인다.
 * 출근 토글을 켜면 서버가 자동으로 '출근'으로 바꾸고, 그 변화는 실시간으로 이 콤보박스에도 반영된다.
 */
export function PresenceSelect() {
  const { myStatus, changeMyStatus } = useMessenger();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  async function onChange(value: string) {
    setBusy(true);
    try {
      await changeMyStatus(value);
    } catch (err) {
      logError("Messenger", "내 상태 변경 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "상태를 바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

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
