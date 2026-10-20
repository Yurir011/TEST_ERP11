import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../context/useAuth";
import { apiDelete, apiGet, apiPut } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { getBenchClient } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { RealtimeClient, realtimeUrl, type ConnectionStatus } from "../../lib/realtime";
import { applyIncomingMessage, applyReadEvent, totalUnread } from "./messengerState";
import { withFavorite, withStatus } from "./presence";
import type { ConversationSummary, DirectoryUser, RealtimeEvent } from "./types";
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
  const [directory, setDirectory] = useState<DirectoryUser[] | null>(null);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const myStatusRef = useRef<string | null>(null);
  const directoryWanted = useRef(false); // 메신저 화면이 전체 목록을 쓰고 있는가 (아니면 상태 알림을 굳이 반영하지 않는다)

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
    myStatusRef.current = myStatus; // 상태 변경이 거절됐을 때 되돌릴 이전 값
  }, [myStatus]);

  const loadDirectory = useCallback(async () => {
    try {
      const [dir, status] = await Promise.all([
        apiGet<DirectoryUser[]>("/api/messenger/directory"),
        apiGet<{ status: string }>("/api/messenger/status"),
      ]);
      setDirectory(dir);
      setMyStatus(status.status);
    } catch (err) {
      logError("Messenger", "전체 목록 조회 실패", err);
    }
  }, []);

  const ensureDirectory = useCallback(() => {
    directoryWanted.current = true;
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    if (meId === null) return;
    const client = new RealtimeClient<RealtimeEvent>({ url: realtimeUrl(), getToken });
    const offStatus = client.onStatus((s) => {
      setConnection(s);
      if (s.state === "connected") {
        void refresh(); // (다시) 연결되면 그 사이 놓친 것을 반영한다
        if (directoryWanted.current) void loadDirectory();
      }
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
          void getBenchClient()?.notify(title, m.body || `[파일] ${m.attachments[0]?.file_name ?? ""}`, m.conversation_id); // 알림을 누르면 이 대화방으로
        }
      } else if (event.type === "conversation.read") {
        if (!list) return;
        const r = applyReadEvent(list, event, me);
        apply(r.list);
        if (r.needsRefetch) void refresh();
      } else if (event.type === "conversation.updated" || event.type === "message.deleted") {
        void refresh(); // 지워진 메시지는 목록의 미리보기와 안 읽은 수가 달라진다
      } else if (event.type === "presence.updated") {
        if (!directoryWanted.current) return;
        setDirectory((prev) => (prev ? withStatus(prev, event.user_id, event.status) : prev));
        if (event.user_id === me) setMyStatus(event.status);
      } else if (event.type === "favorites.updated") {
        if (directoryWanted.current) void loadDirectory(); // 내 다른 창에서 바꾼 즐겨찾기
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
      setDirectory(null);
      setMyStatus(null);
      directoryWanted.current = false;
      logDebug("Messenger", "실시간 연결 종료");
    };
  }, [meId, apply, refresh, loadDirectory]);

  // 창을 다시 볼 때(날이 바뀌었거나 연차가 승인된 경우 등) 상태를 최신으로
  useEffect(() => {
    function onFocus() {
      if (directoryWanted.current) void loadDirectory();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadDirectory]);

  const changeMyStatus = useCallback(
    async (status: string) => {
      const previous = myStatusRef.current;
      setMyStatus(status);
      try {
        await apiPut("/api/messenger/status", { status });
      } catch (err) {
        setMyStatus(previous); // 서버가 받지 않았으면 화면도 원래대로
        throw err;
      }
    },
    [],
  );

  const toggleFavorite = useCallback(async (userId: number, on: boolean) => {
    setDirectory((prev) => (prev ? withFavorite(prev, userId, on) : prev));
    try {
      if (on) await apiPut(`/api/messenger/favorites/${userId}`);
      else await apiDelete(`/api/messenger/favorites/${userId}`);
    } catch (err) {
      setDirectory((prev) => (prev ? withFavorite(prev, userId, !on) : prev));
      throw err;
    }
  }, []);

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
    () => ({ conversations, unreadTotal, connection, refresh, subscribe, setActiveConversation, directory, myStatus, ensureDirectory, changeMyStatus, toggleFavorite }),
    [conversations, unreadTotal, connection, refresh, subscribe, setActiveConversation, directory, myStatus, ensureDirectory, changeMyStatus, toggleFavorite],
  );
  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}
