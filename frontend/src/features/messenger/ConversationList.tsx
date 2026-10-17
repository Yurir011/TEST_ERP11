import { BellOff, Plus, Users } from "lucide-react";
import { listTimeLabel } from "./messengerState";
import type { ConversationSummary } from "./types";

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: ConversationSummary[] | null;
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  return (
    <aside className="w-80 shrink-0 bg-surface border border-border rounded-2xl flex flex-col overflow-hidden" aria-label="대화방 목록">
      <div className="p-3 border-b border-border">
        <button type="button" onClick={onNew} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium py-2.5">
          <Plus size={16} />새 대화
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations === null && <p className="p-4 text-sm text-text-muted">불러오는 중...</p>}
        {conversations?.length === 0 && <p className="p-4 text-sm text-text-muted">대화가 없습니다. [새 대화]로 동료와 대화를 시작하세요.</p>}
        {conversations?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            aria-current={c.id === activeId ? "true" : undefined}
            className={`w-full text-left px-4 py-3 border-b border-border last:border-0 flex gap-3 items-start transition-colors ${c.id === activeId ? "bg-bg" : "hover:bg-bg/60"}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {c.kind === "group" && <Users size={13} className="text-text-muted shrink-0" aria-label="그룹 대화" />}
                <span className={`truncate text-sm ${c.unread_count > 0 ? "font-semibold" : "font-medium"}`}>{c.title}</span>
                {c.kind === "group" && <span className="text-[11px] text-text-muted shrink-0">{c.members.length}</span>}
                {c.muted && <BellOff size={12} className="text-text-muted shrink-0" aria-label="알림 꺼짐" />}
              </div>
              <p className="text-xs text-text-muted truncate mt-0.5">
                {c.last_message ? `${c.kind === "group" && c.last_message.sender_name ? `${c.last_message.sender_name}: ` : ""}${c.last_message.preview}` : "대화를 시작하세요"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[11px] text-text-muted">{listTimeLabel(c.last_message_at)}</span>
              {c.unread_count > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-badge-bg border border-badge-border text-badge-fg text-[10px] font-semibold flex items-center justify-center" aria-label={`안 읽은 메시지 ${c.unread_count}개`}>
                  {c.unread_count > 99 ? "99+" : c.unread_count}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
