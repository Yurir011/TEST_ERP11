// 메신저 API(backend/app/schemas/messenger.py)와 같은 모양.

export interface MessengerUser {
  id: number;
  name: string;
  grade: string;
  title: string | null;
}

export interface Member {
  id: number;
  name: string;
  last_read_message_id: number | null;
}

export interface LastMessage {
  id: number;
  sender_id: number | null;
  sender_name: string | null;
  preview: string;
  has_attachment: boolean;
  created_at: string;
}

export interface ConversationSummary {
  id: number;
  kind: "direct" | "group";
  title: string;
  members: Member[];
  last_message: LastMessage | null;
  unread_count: number;
  muted: boolean;
  created_at: string;
  last_message_at: string | null;
}

export interface Attachment {
  id: number;
  file_name: string;
  size: number;
  content_type: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  sender_name: string | null;
  body: string;
  created_at: string;
  client_msg_id: string | null;
  attachments: Attachment[];
  /** 보낸 사람이 지운 메시지이면 그 시각 (내용·첨부는 비어 있고 "삭제된 메시지입니다"로 보인다) */
  deleted_at?: string | null;
}

export interface MessagePage {
  messages: ChatMessage[];
  has_more: boolean;
}

/** 서버로 보내는 중이거나 보내지 못한 내 메시지 (화면에만 있다) */
export interface PendingMessage {
  clientMsgId: string;
  body: string;
  fileName?: string;
  failed: boolean;
  error?: string;
  createdAt: string;
  /** 다시 보내기에 쓴다 (파일이면 그 파일) */
  file?: File;
}

export type RealtimeEvent =
  | { type: "message.created"; message: ChatMessage }
  | { type: "message.deleted"; message: ChatMessage }
  | { type: "conversation.read"; conversation_id: number; user_id: number; message_id: number }
  | { type: "conversation.updated"; conversation_id: number }
  | { type: "presence.updated"; user_id: number; status: string }
  | { type: "favorites.updated" };

/** 메신저 전체 목록의 직원 한 명 (서버: GET /api/messenger/directory) */
export interface DirectoryUser {
  id: number;
  name: string;
  grade: string;
  title: string | null;
  status: string;
  is_favorite: boolean;
}
