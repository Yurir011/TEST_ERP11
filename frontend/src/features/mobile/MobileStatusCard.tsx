import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { statusDotClass, statusLabel, type PresenceStatus } from "../messenger/presence";
import { useMessengerOptional } from "../messenger/useMessenger";
import { MobileCard } from "./MobileLayout";

// 출근·퇴근은 출퇴근 버튼으로 기록하므로, 여기서는 그 밖의 상태만 고른다 (PC 메신저의 '내 상태'와 같은 값이고 서로 바로 반영된다).
const CHOICES: Exclude<PresenceStatus, "working" | "off" | "absent">[] = ["meeting", "meal", "outside", "trip", "leave"];

/**
 * 모바일 홈의 '내 상태' 카드. 지금 상태를 보여 주고, 회의중·식사중·외근·출장·휴가를 눌러 바꾼다.
 * 고른 상태는 그날 하루 유지되고 직원 모두에게 보인다. 이미 고른 칩을 다시 누르거나 '출근 중으로 돌아가기'를 누르면 출근 상태로 돌아온다.
 * @param isWorking 지금 출근해서 일하는 중인가 (출근 중으로 돌아가기를 보여 줄지 정한다)
 * @param isDone 오늘 퇴근했는가 (퇴근 뒤에는 상태를 바꾸지 않는다)
 */
export function MobileStatusCard({ isWorking, isDone }: { isWorking: boolean; isDone: boolean }) {
  const messenger = useMessengerOptional();
  const ensureDirectory = messenger?.ensureDirectory;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureDirectory?.(); // 내 현재 상태를 불러오고, 이후 PC·다른 기기에서 바뀐 것도 따라온다
  }, [ensureDirectory]);

  if (!messenger) return null;
  const { myStatus, changeMyStatus } = messenger;

  async function choose(next: string) {
    if (busy || isDone) return;
    setError(null);
    setBusy(true);
    try {
      logDebug("MobileStatus", `내 상태 변경 시도: ${myStatus} → ${next}`);
      await changeMyStatus(next);
    } catch (err) {
      logError("MobileStatus", "내 상태 변경 실패", err);
      setError(err instanceof ApiError ? err.message : "상태를 바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const showBack = isWorking && myStatus !== null && myStatus !== "working";

  return (
    <MobileCard className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">내 상태</h2>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <span className={`w-2.5 h-2.5 rounded-full ${myStatus ? statusDotClass(myStatus) : "bg-border"}`} aria-hidden />
          {myStatus ? statusLabel(myStatus) : "불러오는 중..."}
        </span>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="상태 고르기">
        {CHOICES.map((c) => {
          const on = myStatus === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              disabled={busy || isDone || myStatus === null}
              onClick={() => void choose(on && isWorking ? "working" : c)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium disabled:opacity-40 ${
                on ? "border-primary bg-primary/10 text-primary" : "border-border bg-bg text-text"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusDotClass(c)}`} aria-hidden />
              {statusLabel(c)}
            </button>
          );
        })}
      </div>

      {showBack && (
        <button type="button" disabled={busy || isDone} onClick={() => void choose("working")} className="text-xs text-primary disabled:opacity-40">
          출근 중으로 돌아가기
        </button>
      )}
      {isDone && <p className="text-xs text-text-muted">퇴근한 뒤에는 상태를 바꿀 수 없어요.</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </MobileCard>
  );
}
