import { useEffect, useState } from "react";
import { useAuth } from "../../context/useAuth";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { loadApprovalItems } from "./approvalQueue";

export interface MobileBadges {
  /** 내가 결재할 문서 수 */
  approvals: number;
  /** 안 읽은 알림 수 */
  unread: number;
}

// 하단 탭의 숫자 표시. 화면을 옮길 때마다 서버를 부르지 않도록 잠시 보관한다.
const TTL_MS = 15_000;
let cache: { at: number; value: MobileBadges; withApprovals: boolean } | null = null;
let inflight: Promise<MobileBadges> | null = null;

/** 결재·알림을 처리한 직후처럼 숫자가 바뀌었을 때 불러서 다음 화면에서 새로 받게 한다. */
export function invalidateMobileBadges() {
  cache = null;
}

async function loadBadges(withApprovals: boolean): Promise<MobileBadges> {
  logDebug("MobileBadges", `탭 숫자 조회: approvals=${withApprovals}`);
  const [approvals, unread] = await Promise.all([
    withApprovals ? loadApprovalItems().then((l) => l.length) : Promise.resolve(0),
    apiGet<{ count: number }>("/api/notifications/unread-count")
      .then((r) => r.count)
      .catch((err) => {
        logError("MobileBadges", "알림 개수 조회 실패", err);
        return 0;
      }),
  ]);
  return { approvals, unread };
}

export function useMobileBadges(): MobileBadges {
  const { user } = useAuth();
  const withApprovals = user?.role !== "site_admin";
  const [badges, setBadges] = useState<MobileBadges>(cache?.value ?? { approvals: 0, unread: 0 });

  useEffect(() => {
    let alive = true;
    // 잠시 보관한 값이 있으면 (처음 상태로 이미 쓰고 있으므로) 서버를 다시 부르지 않는다.
    if (cache && cache.withApprovals === withApprovals && Date.now() - cache.at < TTL_MS) return;
    inflight ??= loadBadges(withApprovals).finally(() => {
      inflight = null;
    });
    void inflight.then((value) => {
      cache = { at: Date.now(), value, withApprovals };
      if (alive) setBadges(value);
    });
    return () => {
      alive = false;
    };
  }, [withApprovals]);

  return badges;
}
