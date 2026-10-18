import { useEffect, useState } from "react";

import { apiGet, apiPut } from "../../lib/api";
import { getBenchClient } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";

/** 앱이 서버에 안 읽은 수를 다시 알리는 간격 (서버는 30분 넘게 소식이 없으면 숫자를 지운다) */
export const REPORT_INTERVAL_MS = 5 * 60_000;
/** 브라우저가 서버에서 숫자를 다시 읽는 간격 */
export const READ_INTERVAL_MS = 2 * 60_000;

/**
 * 안 읽은 메일 수 (사이드바 표시용).
 * - 앱: 이 PC 의 받은메일함 수를 직접 쓰고, 바뀔 때와 몇 분마다 서버에 알린다 (웹 화면에서도 볼 수 있게).
 * - 브라우저: 앱이 서버에 알려 둔 숫자만 읽는다. 알려 준 적이 없거나 오래되면 null.
 * 메일 내용은 어느 쪽으로도 서버에 가지 않고 숫자만 오간다.
 */
export function useMailUnread(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const bridge = getBenchClient()?.mail;
    let cancelled = false;

    if (typeof bridge?.unread === "function") {
      let last: number | null = null;
      const report = (n: number | null) => {
        if (cancelled || n === null) return;
        setCount(n);
        last = n;
        apiPut("/api/mail/unread", { unread: n }).catch((err) => logError("Mail", "안 읽은 메일 수를 서버에 알리지 못했습니다", err));
      };
      void bridge.unread().then(report);
      const off = bridge.onUnread(({ unread }) => {
        if (unread !== last) report(unread);
      });
      const timer = window.setInterval(() => {
        if (last !== null) report(last);
      }, REPORT_INTERVAL_MS);
      return () => {
        cancelled = true;
        off();
        window.clearInterval(timer);
      };
    }

    const read = () =>
      apiGet<{ unread: number | null }>("/api/mail/unread")
        .then((r) => !cancelled && setCount(r.unread))
        .catch((err) => logDebug("Mail", `안 읽은 메일 수 조회 실패: ${(err as Error).message}`));
    void read();
    const timer = window.setInterval(read, READ_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return count;
}
