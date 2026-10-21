import { useEffect, useState } from "react";
import { getBenchClient, type NewMailItem } from "../../lib/desktop";
import { logDebug } from "../../lib/logger";

export const MAX_NOTICES = 3;

/** 알림 한 건을 가리키는 키 (메일 번호는 계정마다 따로 매겨지므로 계정과 함께 쓴다) */
export const noticeKey = (n: Pick<NewMailItem, "id" | "accountId">) => `${n.accountId ?? ""}:${n.id}`;

/** 보낸 사람 글("홍길동 <a@x.com>")에서 보여 줄 이름만 뽑는다 (이름이 없으면 주소) */
export function senderLabel(from: string): string {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return (m ? m[1].trim() || m[2].trim() : from.trim()) || "(보낸 사람 없음)";
}

/**
 * 새 메일 알림 목록 (앱 전용): 새 메일이 도착하면 보낸 사람·제목을 최근 것부터 최대 3통 쌓아 둔다.
 * 직접 닫거나, 눌러서 열거나, 안 읽은 메일이 0통이 되면 사라진다. 메일 내용은 이 PC 안에서만 다루고 서버로 보내지 않는다.
 * unread: 지금 안 읽은 메일 수 (모르면 null)
 */
export function useNewMailNotices(unread: number | null) {
  const [items, setItems] = useState<NewMailItem[]>([]);

  useEffect(() => {
    const bridge = getBenchClient()?.mail;
    if (typeof bridge?.onNewMail !== "function") return;
    return bridge.onNewMail((incoming) => {
      logDebug("Mail", `새 메일 알림 ${incoming.length}건`);
      setItems((prev) => {
        const fresh = incoming.filter((n) => !prev.some((p) => noticeKey(p) === noticeKey(n)));
        return [...fresh.reverse(), ...prev].slice(0, MAX_NOTICES); // 가장 최근에 온 것이 맨 위
      });
    });
  }, []);

  // 안 읽은 메일이 0통이 되면 알림도 비운다 (렌더 중 상태 조정: 효과 없이 한 번에 반영)
  if (unread === 0 && items.length > 0) setItems([]);

  return {
    items,
    dismiss: (item: NewMailItem) => setItems((prev) => prev.filter((n) => noticeKey(n) !== noticeKey(item))),
    clear: () => setItems([]),
  };
}
