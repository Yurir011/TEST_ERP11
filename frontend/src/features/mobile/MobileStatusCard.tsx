import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { logDebug } from "../../lib/logger";
import { STATUS_OPTIONS, statusDotClass, statusLabel } from "../messenger/presence";
import { useMessengerOptional } from "../messenger/useMessenger";
import { usePresenceChange } from "../messenger/usePresenceChange";
import { MobileCard } from "./MobileLayout";

/** 서버 값이 없을 때 쓰는 자리 표시용 (messenger 가 없으면 카드를 아예 그리지 않으므로 훅 호출 순서만 맞춘다) */
const NOOP = async () => {};

/**
 * 모바일 홈의 '내 상태' 카드. PC 메신저의 콤보박스와 같은 7가지(출근·회의중·식사중·외근·출장·휴가·퇴근)를
 * 카드를 눌러 아래에서 올라오는 목록에서 고른다. 출근·퇴근을 고르면 근태 기록도 함께 남고, 고른 상태는 직원 모두에게 보인다.
 */
export function MobileStatusCard() {
  const messenger = useMessengerOptional();
  const ensureDirectory = messenger?.ensureDirectory;
  const { busy, change } = usePresenceChange(messenger?.changeMyStatus ?? NOOP);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    ensureDirectory?.(); // 내 현재 상태를 불러오고, 이후 PC·다른 기기에서 바뀐 것도 따라온다
  }, [ensureDirectory]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!messenger) return null;
  const { myStatus } = messenger;

  async function choose(value: string) {
    setOpen(false);
    if (value === myStatus) return;
    logDebug("MobileStatus", `내 상태 변경 시도: ${myStatus} → ${value}`);
    await change(value);
  }

  return (
    <>
      <MobileCard>
        <p className="text-sm font-semibold mb-2">내 상태</p>
        <button
          type="button"
          aria-haspopup="dialog"
          disabled={busy || myStatus === null}
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5 text-[15px] disabled:opacity-60"
        >
          <span className={`w-2.5 h-2.5 rounded-full ${myStatus ? statusDotClass(myStatus) : "bg-border"}`} aria-hidden />
          {myStatus ? statusLabel(myStatus) : "불러오는 중..."}
          <ChevronDown size={16} className="ml-auto text-text-muted" aria-hidden />
        </button>
      </MobileCard>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="내 상태 고르기">
          <button type="button" aria-label="닫기" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-w-lg mx-auto bg-surface border-t border-border rounded-t-2xl px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="w-9 h-1 rounded-full bg-border mx-auto mb-2" aria-hidden />
            <ul>
              {STATUS_OPTIONS.map((o) => {
                const on = myStatus === o.value;
                return (
                  <li key={o.value} className="border-b border-border last:border-0">
                    <button type="button" aria-current={on} onClick={() => void choose(o.value)} className="w-full flex items-center gap-3 px-1.5 py-3 text-[15px] text-left">
                      <span className={`w-2.5 h-2.5 rounded-full ${statusDotClass(o.value)}`} aria-hidden />
                      {o.label}
                      {(o.value === "working" || o.value === "off") && <span className="text-xs text-text-muted">근태 기록</span>}
                      {on && <span className="ml-auto text-primary font-bold" aria-hidden>✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
