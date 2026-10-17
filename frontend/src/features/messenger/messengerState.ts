// 메신저 화면의 계산 로직 (화면과 분리한 순수 함수). 서버 규칙은 backend/app/services/messenger.py.
import type { ChatMessage, ConversationSummary, Member, PendingMessage } from "./types";

const PREVIEW_LENGTH = 100;

export function previewOf(m: Pick<ChatMessage, "body" | "attachments">): string {
  if (m.body) return m.body.slice(0, PREVIEW_LENGTH);
  if (m.attachments.length > 0) return `[파일] ${m.attachments[0].file_name}`.slice(0, PREVIEW_LENGTH);
  return "";
}

/** 마지막 활동이 최근인 대화방이 위로 (서버 정렬과 같은 기준: 마지막 메시지 시각, 없으면 만든 시각) */
export function sortConversations(list: ConversationSummary[]): ConversationSummary[] {
  const key = (c: ConversationSummary) => new Date(c.last_message_at ?? c.created_at).getTime();
  return [...list].sort((a, b) => key(b) - key(a) || b.id - a.id);
}

export function totalUnread(list: ConversationSummary[] | null): number {
  return list ? list.reduce((sum, c) => sum + c.unread_count, 0) : 0;
}

export interface IncomingContext {
  meId: number;
  /** 지금 화면에 열려 있고 사용자가 보고 있는 대화방 (보고 있으면 안 읽음으로 세지 않는다) */
  viewingConversationId: number | null;
}

/**
 * 새 메시지를 대화방 목록에 반영한다. 목록에 없는 대화방이면 known=false (호출한 쪽이 목록을 다시 받는다).
 * 이미 반영한 메시지(번호가 마지막 메시지 이하)가 또 오면 무시한다.
 */
export function applyIncomingMessage(list: ConversationSummary[], msg: ChatMessage, ctx: IncomingContext): { list: ConversationSummary[]; known: boolean } {
  const target = list.find((c) => c.id === msg.conversation_id);
  if (!target) return { list, known: false };
  if (target.last_message && msg.id <= target.last_message.id) return { list, known: true };

  const mine = msg.sender_id === ctx.meId;
  const watching = ctx.viewingConversationId === msg.conversation_id;
  const updated: ConversationSummary = {
    ...target,
    last_message: {
      id: msg.id,
      sender_id: msg.sender_id,
      sender_name: msg.sender_name,
      preview: previewOf(msg),
      has_attachment: msg.attachments.length > 0,
      created_at: msg.created_at,
    },
    last_message_at: msg.created_at,
    unread_count: mine || watching ? target.unread_count : target.unread_count + 1,
    members: mine ? target.members.map((m) => (m.id === ctx.meId ? { ...m, last_read_message_id: msg.id } : m)) : target.members,
  };
  return { list: sortConversations(list.map((c) => (c.id === updated.id ? updated : c))), known: true };
}

/**
 * 읽음 알림을 반영한다. 내가 읽은 것이면 안 읽은 수를 줄이는데, 마지막 메시지까지 읽은 경우만 0 으로 만들 수 있다
 * (그보다 앞까지만 읽었다면 정확한 수를 모르므로 needsRefetch). 다른 사람이 읽은 것이면 그 사람의 읽은 위치를 갱신한다.
 */
export function applyReadEvent(
  list: ConversationSummary[],
  ev: { conversation_id: number; user_id: number; message_id: number },
  meId: number,
): { list: ConversationSummary[]; needsRefetch: boolean } {
  const target = list.find((c) => c.id === ev.conversation_id);
  if (!target) return { list, needsRefetch: false };
  let needsRefetch = false;
  const members: Member[] = target.members.map((m) =>
    m.id === ev.user_id ? { ...m, last_read_message_id: Math.max(m.last_read_message_id ?? 0, ev.message_id) } : m,
  );
  let unread = target.unread_count;
  if (ev.user_id === meId && unread > 0) {
    if (target.last_message && ev.message_id >= target.last_message.id) unread = 0;
    else needsRefetch = true;
  }
  return { list: list.map((c) => (c.id === target.id ? { ...target, members, unread_count: unread } : c)), needsRefetch };
}

/** 가져온 메시지를 이미 있는 목록에 합친다 (번호 기준 중복 제거, 오래된 것부터). */
export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** 서버에 저장되어 돌아온(또는 이벤트로 온) 내 메시지와 같은 client_msg_id 의 "보내는 중" 항목을 지운다. */
export function dropConfirmedPending(pending: PendingMessage[], messages: ChatMessage[]): PendingMessage[] {
  const confirmed = new Set(messages.map((m) => m.client_msg_id).filter((x): x is string => !!x));
  return confirmed.size === 0 ? pending : pending.filter((p) => !confirmed.has(p.clientMsgId));
}

/**
 * 이 메시지를 **아직 읽지 않은 사람** 수 (카카오톡처럼 메시지 옆에 숫자로 보여 준다. 0 이면 숫자를 숨긴다).
 * 보낸 사람은 세지 않고, 대화방에 지금 참여 중인 사람만 센다 (나간 사람은 목록에 없다).
 * 새로 들어온 참여자는 그때까지의 메시지를 읽은 것으로 시작하므로(서버 규칙) 이전 메시지의 숫자에 들어가지 않는다.
 */
export function unreadReaders(message: Pick<ChatMessage, "id" | "sender_id">, members: Member[]): number {
  return members.filter((m) => m.id !== message.sender_id && (m.last_read_message_id ?? 0) < message.id).length;
}

export interface ThreadItem {
  key: string;
  type: "date" | "message";
  /** type === "date": 날짜 줄 글자 */
  label?: string;
  message?: ChatMessage;
  mine?: boolean;
  /** 같은 사람이 5분 안에 이어서 보낸 것이면 이름·시각을 생략하고 붙여서 그린다 */
  continued?: boolean;
  /** 같은 사람의 묶음에서 마지막 메시지만 시각을 보여 준다 */
  showTime?: boolean;
}

const GROUP_GAP_MS = 5 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 대화방 목록의 시각: 오늘이면 시:분, 아니면 월-일 */
export function listTimeLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  return dayKey(iso) === dayKey(now.toISOString()) ? timeLabel(iso) : `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 메시지를 날짜 줄과 묶음 정보가 붙은 화면용 목록으로 바꾼다. */
export function buildThreadItems(messages: ChatMessage[], meId: number): ThreadItem[] {
  const items: ThreadItem[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
    if (newDay) items.push({ key: `d-${dayKey(m.created_at)}`, type: "date", label: dateLabel(m.created_at) });

    const sameAsPrev = !!prev && !newDay && prev.sender_id === m.sender_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
    const nextDay = !next || dayKey(next.created_at) !== dayKey(m.created_at);
    const sameAsNext = !!next && !nextDay && next.sender_id === m.sender_id && new Date(next.created_at).getTime() - new Date(m.created_at).getTime() < GROUP_GAP_MS;
    items.push({ key: `m-${m.id}`, type: "message", message: m, mine: m.sender_id === meId, continued: sameAsPrev, showTime: !sameAsNext });
  });
  return items;
}

/** 파일 크기를 사람이 읽기 쉬운 글자로 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

/** 브라우저(화면)에서 바로 보여 줘도 안전한 형식 (서버가 파일 내용을 확인한 형식 중) */
export function isInlineViewable(contentType: string): boolean {
  return contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/webp" || contentType === "image/gif" || contentType === "application/pdf";
}

export function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_BODY_LENGTH = 4000;

export function newClientMsgId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-0000`;
}
