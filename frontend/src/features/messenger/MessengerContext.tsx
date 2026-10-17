import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../context/useAuth";
import { apiGet } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { getBenchClient } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { RealtimeClient, realtimeUrl, type ConnectionStatus } from "../../lib/realtime";
import { applyIncomingMessage, applyReadEvent, totalUnread } from "./messengerState";
import type { ConversationSummary, RealtimeEvent } from "./types";
import { MessengerContext, type MessengerContextValue } from "./useMessenger";

const BASE_TITLE = "BENCH ERP";

function isViewing(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * 로그인한 동안 실시간 연결을 하나 유지하고, 대화방 목록·안 읽은 수를 최신으로 둔다.
 * 새 메시지가 오면(내가 보고 있는 대화방이 아니고, 알림을 끄지 않았다면) 데스크톱 앱 알림을 띄우고, 앱 아이콘 배지·창 제목에 안 읽은 수를 표시한다.
 */
export function MessengerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const meId = user?.id ?? null;
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>({ state: "disconnected", epoch: 0 });
  const listeners = useRef(new Set<(e: RealtimeEvent) => void>());
  const activeId = useRef<number | null>(null);
  const conversationsRef = useRef<ConversationSummary[] | null>(null);

  const apply = useCallback((next: ConversationSummary[] | null) => {
    conversationsRef.current = next;
    setConversations(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await apiGet<ConversationSummary[]>("/api/messenger/conversations"));
    } catch (err) {
      logError("Messenger", "대화방 목록 조회 실패", err);
    }
  }, [apply]);

  useEffect(() => {
    if (meId === null) return;
    const client = new RealtimeClient<RealtimeEvent>({ url: realtimeUrl(), getToken });
    const offStatus = client.onStatus((s) => {
      setConnection(s);
      if (s.state === "connected") void refresh(); // (다시) 연결되면 그 사이 놓친 것을 반영한다
    });
    const offEvent = client.onEvent((event) => {
      handleEvent(event, meId);
      for (const l of [...listeners.current]) l(event);
    });

    function handleEvent(event: RealtimeEvent, me: number) {
      const list = conversationsRef.current;
      if (event.type === "message.created") {
        const m = event.message;
        const viewing = isViewing() && activeId.current === m.conversation_id;
        if (list) {
          const r = applyIncomingMessage(list, m, { meId: me, viewingConversationId: viewing ? m.conversation_id : null });
          if (!r.known) void refresh();
          else apply(r.list);
        } else void refresh();
        const conv = list?.find((c) => c.id === m.conversation_id);
        const alreadyShown = !!conv?.last_message && m.id <= conv.last_message.id; // 같은 메시지가 또 온 경우 (다시 연결·중복 전달)
        if (m.sender_id !== me && !viewing && !conv?.muted && !alreadyShown) {
          const title = conv?.kind === "group" ? `${conv.title} · ${m.sender_name ?? ""}` : (m.sender_name ?? "새 메시지");
          void getBenchClient()?.notify(title, m.body || `[파일] ${m.attachments[0]?.file_name ?? ""}`);
        }
      } else if (event.type === "conversation.read") {
        if (!list) return;
        const r = applyReadEvent(list, event, me);
        apply(r.list);
        if (r.needsRefetch) void refresh();
      } else if (event.type === "conversation.updated") {
        void refresh();
      }
    }

    apiGet<ConversationSummary[]>("/api/messenger/conversations")
      .then(apply)
      .catch((err) => logError("Messenger", "대화방 목록 조회 실패", err));
    client.start();
    logDebug("Messenger", "실시간 연결 시작");
    return () => {
      offStatus();
      offEvent();
      client.stop();
      apply(null); // 로그아웃·계정 전환 때 이전 사람의 대화 목록이 남지 않게 한다
      logDebug("Messenger", "실시간 연결 종료");
    };
  }, [meId, apply, refresh]);

  const unreadTotal = useMemo(() => totalUnread(conversations), [conversations]);

  // 앱 아이콘 배지와 창 제목에 안 읽은 수 표시
  useEffect(() => {
    void getBenchClient()?.setBadge(unreadTotal);
    document.title = unreadTotal > 0 ? `(${unreadTotal > 99 ? "99+" : unreadTotal}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unreadTotal]);

  const subscribe = useCallback((listener: (e: RealtimeEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const setActiveConversation = useCallback((id: number | null) => {
    activeId.current = id;
  }, []);

  const value = useMemo<MessengerContextValue>(
    () => ({ conversations, unreadTotal, connection, refresh, subscribe, setActiveConversation }),
    [conversations, unreadTotal, connection, refresh, subscribe, setActiveConversation],
  );
  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}
