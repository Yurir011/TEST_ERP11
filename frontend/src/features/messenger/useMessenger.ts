import { createContext, useContext } from "react";
import type { ConnectionStatus } from "../../lib/realtime";
import type { ConversationSummary, DirectoryUser, RealtimeEvent } from "./types";

// 메신저 상태 컨텍스트와 훅. Provider(MessengerContext.tsx)와 파일을 나눠, 컴포넌트 파일이 컴포넌트만 내보내게 한다(빠른 새로고침).

export interface MessengerContextValue {
  /** 내 대화방 목록 (아직 불러오지 못했으면 null) */
  conversations: ConversationSummary[] | null;
  /** 모든 대화방의 안 읽은 메시지 수 */
  unreadTotal: number;
  connection: ConnectionStatus;
  /** 대화방 목록을 서버에서 다시 받는다 */
  refresh: () => Promise<void>;
  /** 서버가 보낸 실시간 이벤트를 받는다 (해제 함수를 돌려준다) */
  subscribe: (listener: (event: RealtimeEvent) => void) => () => void;
  /** 지금 열려 있는 대화방을 알린다 (그 방의 새 메시지는 보고 있는 동안 "안 읽음"이나 알림으로 세지 않는다) */
  setActiveConversation: (id: number | null) => void;
  /** 전체 목록(직원별 현재 상태·즐겨찾기). ensureDirectory() 를 부르기 전에는 null — 메신저 화면이 열릴 때 부른다 */
  directory: DirectoryUser[] | null;
  /** 내 현재 상태 (아직 모르면 null) */
  myStatus: string | null;
  /** 전체 목록과 내 상태를 불러오고, 이후 실시간·재연결·창 활성화 때 최신으로 유지한다 */
  ensureDirectory: () => void;
  /** 내 상태를 바꾼다 (화면에는 바로 반영하고, 서버가 거절하면 되돌린 뒤 오류를 던진다) */
  changeMyStatus: (status: string) => Promise<void>;
  /** 직원을 즐겨찾기에 넣거나 뺀다 (화면에는 바로 반영하고, 서버가 거절하면 되돌린 뒤 오류를 던진다) */
  toggleFavorite: (userId: number, on: boolean) => Promise<void>;
}

export const MessengerContext = createContext<MessengerContextValue | undefined>(undefined);

export function useMessenger(): MessengerContextValue {
  const ctx = useContext(MessengerContext);
  if (!ctx) throw new Error("useMessenger must be used within MessengerProvider");
  return ctx;
}

/** 로그인 전 화면 등 Provider 밖에서도 안전하게 쓰는 버전 (없으면 undefined) */
export function useMessengerOptional(): MessengerContextValue | undefined {
  return useContext(MessengerContext);
}
