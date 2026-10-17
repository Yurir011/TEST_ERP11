import { Bell, BellOff, LogOut, UserPlus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUploadForm } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { MessageBubble, PendingBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import {
  MAX_ATTACHMENT_BYTES,
  buildThreadItems,
  dropConfirmedPending,
  formatBytes,
  mergeMessages,
  newClientMsgId,
  readLabel,
} from "./messengerState";
import { NewConversationModal } from "./NewConversationModal";
import type { ChatMessage, ConversationSummary, MessagePage, PendingMessage } from "./types";
import { useMessenger } from "./useMessenger";

const PAGE_SIZE = 50;
const NEAR_BOTTOM_PX = 80;

function isViewing(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * 한 대화방의 대화 화면. `key={대화방 번호}` 로 그려서 대화방이 바뀌면 처음부터 새로 시작한다.
 * - 열면 최근 50개를 받고, 위로 올라가면 이전 메시지를 더 받는다.
 * - 서버의 실시간 알림으로 새 메시지를 붙이고, 연결이 끊겼다 다시 연결되면 그 사이 놓친 메시지를 번호 기준으로 받아 합친다.
 * - 내가 보낸 메시지는 저장될 때까지 "보내는 중"으로 먼저 보이고, 실패하면 다시 보내거나 지울 수 있다.
 *   다시 보내도 같은 client_msg_id 를 쓰므로 서버에 두 번 저장되지 않는다.
 */
export function MessageThread({ conversation, meId }: { conversation: ConversationSummary; meId: number }) {
  const id = conversation.id;
  const { subscribe, connection, setActiveConversation, refresh } = useMessenger();
  const dialog = useDialog();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef<number | null>(null); // 이전 메시지를 위에 붙일 때 보던 위치를 유지하기 위한 이전 스크롤 높이
  const loaded = useRef(false);
  const early = useRef<ChatMessage[]>([]); // 처음 불러오는 동안 실시간으로 먼저 도착한 메시지
  const messagesRef = useRef<ChatMessage[]>([]);
  const lastReadSent = useRef<number>(conversation.members.find((m) => m.id === meId)?.last_read_message_id ?? 0);
  const epochSeen = useRef(connection.epoch);

  // ── 불러오기 ──
  useEffect(() => {
    let cancelled = false;
    logDebug("Messenger", `대화 불러오기: conversation_id=${id}`);
    apiGet<MessagePage>(`/api/messenger/conversations/${id}/messages?limit=${PAGE_SIZE}`)
      .then((page) => {
        if (cancelled) return;
        loaded.current = true;
        const merged = mergeMessages(page.messages, early.current);
        early.current = [];
        setMessages(merged);
        setHasMore(page.has_more);
      })
      .catch((err) => {
        logError("Messenger", "메시지 조회 실패", err);
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "메시지를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    messagesRef.current = messages ?? [];
  }, [messages]);

  useEffect(() => {
    setActiveConversation(id);
    return () => setActiveConversation(null);
  }, [id, setActiveConversation]);

  // ── 읽음 표시: 이 화면을 보고 있는 동안 가장 최근 메시지까지 읽은 것으로 서버에 알린다 ──
  const markReadIfNeeded = useCallback(() => {
    const newest = messagesRef.current.at(-1);
    if (!newest || newest.id <= lastReadSent.current || !isViewing()) return;
    lastReadSent.current = newest.id;
    apiPut(`/api/messenger/conversations/${id}/read`, { message_id: newest.id }).catch((err) => {
      lastReadSent.current = Math.min(lastReadSent.current, newest.id - 1); // 실패하면 다음에 다시 시도
      logError("Messenger", "읽음 표시 실패", err);
    });
  }, [id]);

  useEffect(() => {
    markReadIfNeeded();
  }, [messages, markReadIfNeeded]);

  useEffect(() => {
    window.addEventListener("focus", markReadIfNeeded);
    document.addEventListener("visibilitychange", markReadIfNeeded);
    return () => {
      window.removeEventListener("focus", markReadIfNeeded);
      document.removeEventListener("visibilitychange", markReadIfNeeded);
    };
  }, [markReadIfNeeded]);

  // ── 실시간 새 메시지 ──
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type !== "message.created" || event.message.conversation_id !== id) return;
        const m = event.message;
        if (!loaded.current) {
          early.current.push(m);
          return;
        }
        setMessages((prev) => mergeMessages(prev ?? [], [m]));
        setPending((prev) => dropConfirmedPending(prev, [m]));
      }),
    [subscribe, id],
  );

  // ── 다시 연결되면 그 사이 놓친 메시지를 받아 합친다 ──
  useEffect(() => {
    if (connection.epoch === epochSeen.current) return;
    epochSeen.current = connection.epoch;
    if (!loaded.current) return;
    const lastId = messagesRef.current.at(-1)?.id ?? 0;
    logDebug("Messenger", `다시 연결됨: 놓친 메시지 확인 (after_id=${lastId})`);
    apiGet<MessagePage>(`/api/messenger/conversations/${id}/messages?after_id=${lastId}`)
      .then((page) => {
        if (page.messages.length === 0) return;
        setMessages((prev) => mergeMessages(prev ?? [], page.messages));
        setPending((prev) => dropConfirmedPending(prev, page.messages));
      })
      .catch((err) => logError("Messenger", "놓친 메시지 조회 실패", err));
  }, [connection.epoch, id]);

  // ── 스크롤 ──
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFrom.current; // 이전 메시지를 붙여도 보던 자리가 그대로
      restoreFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pending]);

  function onScroll() {
    const el = scroller.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  async function loadOlder() {
    const first = messages?.[0];
    if (!first || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiGet<MessagePage>(`/api/messenger/conversations/${id}/messages?limit=${PAGE_SIZE}&before_id=${first.id}`);
      restoreFrom.current = scroller.current?.scrollHeight ?? null;
      setMessages((prev) => mergeMessages(prev ?? [], page.messages));
      setHasMore(page.has_more);
    } catch (err) {
      logError("Messenger", "이전 메시지 조회 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "이전 메시지를 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  }

  // ── 보내기 ──
  async function deliver(p: PendingMessage) {
    try {
      let saved: ChatMessage;
      if (p.file) {
        const form = new FormData();
        form.append("file", p.file);
        if (p.body) form.append("body", p.body);
        form.append("client_msg_id", p.clientMsgId);
        saved = await apiUploadForm<ChatMessage>(`/api/messenger/conversations/${id}/attachments`, form);
      } else {
        saved = await apiPost<ChatMessage>(`/api/messenger/conversations/${id}/messages`, { body: p.body, client_msg_id: p.clientMsgId });
      }
      setMessages((prev) => mergeMessages(prev ?? [], [saved]));
      setPending((prev) => prev.filter((x) => x.clientMsgId !== p.clientMsgId));
    } catch (err) {
      logError("Messenger", "메시지 보내기 실패", err);
      const error = err instanceof ApiError ? err.message : "보내지 못했습니다. 연결을 확인하세요.";
      setPending((prev) => prev.map((x) => (x.clientMsgId === p.clientMsgId ? { ...x, failed: true, error } : x)));
    }
  }

  function enqueue(p: Omit<PendingMessage, "clientMsgId" | "failed" | "createdAt">) {
    const item: PendingMessage = { ...p, clientMsgId: newClientMsgId(), failed: false, createdAt: new Date().toISOString() };
    stickToBottom.current = true;
    setPending((prev) => [...prev, item]);
    void deliver(item);
  }

  function retry(p: PendingMessage) {
    setPending((prev) => prev.map((x) => (x.clientMsgId === p.clientMsgId ? { ...x, failed: false, error: undefined } : x)));
    void deliver({ ...p, failed: false });
  }

  function attach(file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      dialog.notifyError(`파일 크기는 ${formatBytes(MAX_ATTACHMENT_BYTES)}를 넘을 수 없습니다. (${file.name}: ${formatBytes(file.size)})`);
      return;
    }
    enqueue({ body: "", fileName: file.name, file });
  }

  // ── 대화방 설정 ──
  async function toggleMute() {
    try {
      await apiPut(`/api/messenger/conversations/${id}/mute`, { muted: !conversation.muted });
      await refresh();
    } catch (err) {
      dialog.notifyError(err instanceof ApiError ? err.message : "설정을 바꾸지 못했습니다.");
    }
  }

  async function leave() {
    if (!(await dialog.confirm(`'${conversation.title}' 그룹 대화에서 나갈까요?\n나가면 이 대화를 볼 수 없고, 다른 참여자가 다시 초대해야 합니다.`, { okLabel: "나가기", danger: true }))) return;
    try {
      await apiDelete(`/api/messenger/conversations/${id}/members/me`);
      await refresh();
      navigate("/messenger", { replace: true });
    } catch (err) {
      dialog.notifyError(err instanceof ApiError ? err.message : "나가지 못했습니다.");
    }
  }

  const items = useMemo(() => buildThreadItems(messages ?? [], meId), [messages, meId]);
  const lastOwnId = useMemo(() => [...(messages ?? [])].reverse().find((m) => m.sender_id === meId)?.id ?? null, [messages, meId]);
  const isGroup = conversation.kind === "group";

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-5 py-3 border-b border-border flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold truncate">{conversation.title}</h2>
          {isGroup && <p className="text-xs text-text-muted truncate">참여자 {conversation.members.length}명: {conversation.members.map((m) => m.name).join(", ")}</p>}
        </div>
        {isGroup && (
          <button type="button" onClick={() => setShowAdd(true)} title="참여자 추가" aria-label="참여자 추가" className="p-2 rounded-lg text-text-muted hover:bg-bg hover:text-text">
            <UserPlus size={17} />
          </button>
        )}
        <button type="button" onClick={() => void toggleMute()} title={conversation.muted ? "알림 켜기" : "알림 끄기"} aria-label={conversation.muted ? "알림 켜기" : "알림 끄기"} className="p-2 rounded-lg text-text-muted hover:bg-bg hover:text-text">
          {conversation.muted ? <BellOff size={17} /> : <Bell size={17} />}
        </button>
        {isGroup && (
          <button type="button" onClick={() => void leave()} title="대화방 나가기" aria-label="대화방 나가기" className="p-2 rounded-lg text-text-muted hover:bg-bg hover:text-danger">
            <LogOut size={17} />
          </button>
        )}
      </header>

      {connection.state !== "connected" && (
        <div className="px-5 py-1.5 text-xs bg-tile-orange text-tile-orange-fg" role="status">
          실시간 연결이 끊어졌습니다. 다시 연결하는 중... (메시지는 계속 보낼 수 있습니다)
        </div>
      )}

      <div ref={scroller} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-1.5" aria-label="대화 내용">
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {messages === null && !loadError && <p className="text-sm text-text-muted">불러오는 중...</p>}
        {hasMore && (
          <div className="text-center pb-2">
            <button type="button" onClick={() => void loadOlder()} disabled={loadingMore} className="text-xs text-primary hover:underline disabled:opacity-60">
              {loadingMore ? "불러오는 중..." : "이전 메시지 더 보기"}
            </button>
          </div>
        )}
        {messages !== null && messages.length === 0 && pending.length === 0 && <p className="text-sm text-text-muted text-center py-10">아직 메시지가 없습니다. 첫 메시지를 보내 보세요.</p>}
        {items.map((it) =>
          it.type === "date" ? (
            <div key={it.key} className="text-center text-[11px] text-text-muted py-3">
              <span className="bg-bg border border-border rounded-full px-3 py-1">{it.label}</span>
            </div>
          ) : (
            <div key={it.key} className={it.continued ? "" : "pt-2"}>
              <MessageBubble
                message={it.message!}
                mine={!!it.mine}
                showSender={isGroup && !it.mine && !it.continued}
                showTime={!!it.showTime}
                readLabel={it.mine && (isGroup || it.message!.id === lastOwnId) ? readLabel(it.message!, conversation) : null}
              />
            </div>
          ),
        )}
        {pending.map((p) => (
          <div key={p.clientMsgId} className="pt-2">
            <PendingBubble p={p} onRetry={() => retry(p)} onDiscard={() => setPending((prev) => prev.filter((x) => x.clientMsgId !== p.clientMsgId))} />
          </div>
        ))}
      </div>

      <MessageInput onSend={(text) => enqueue({ body: text })} onAttach={attach} />

      {showAdd && (
        <NewConversationModal
          mode="add"
          conversation={conversation}
          onClose={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
