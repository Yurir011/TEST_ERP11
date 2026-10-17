import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TITLE_LABELS, GRADE_LABELS, type JobGrade, type JobTitle } from "../../lib/auth";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { logError } from "../../lib/logger";
import type { ConversationSummary, MessengerUser } from "./types";

interface Props {
  /** create: 새 대화 시작(1명이면 1:1, 2명 이상이면 그룹) / add: 그룹에 참여자 추가 */
  mode: "create" | "add";
  conversation?: ConversationSummary;
  onClose: () => void;
  /** 만들었거나 추가한 대화방 번호 */
  onDone: (conversationId: number) => void;
}

function userLine(u: MessengerUser): string {
  const title = u.title ? TITLE_LABELS[u.title as JobTitle] : null;
  return [GRADE_LABELS[u.grade as JobGrade], title].filter(Boolean).join(" · ");
}

export function NewConversationModal({ mode, conversation, onClose, onDone }: Props) {
  const [users, setUsers] = useState<MessengerUser[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<MessengerUser[]>("/api/messenger/users")
      .then(setUsers)
      .catch((err) => {
        logError("Messenger", "직원 목록 조회 실패", err);
        setError("직원 목록을 불러오지 못했습니다.");
      });
  }, []);

  const existing = useMemo(() => new Set(conversation?.members.map((m) => m.id) ?? []), [conversation]);
  const candidates = useMemo(
    () => (users ?? []).filter((u) => !existing.has(u.id) && (!query.trim() || u.name.includes(query.trim()))),
    [users, existing, query],
  );

  const isGroup = mode === "create" && selected.length >= 2;
  const canSubmit = !busy && selected.length >= 1 && (!isGroup || title.trim().length > 0);

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setError(null);
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "add" && conversation) {
        await apiPost(`/api/messenger/conversations/${conversation.id}/members`, { user_ids: selected });
        onDone(conversation.id);
      } else {
        const created = await apiPost<ConversationSummary>("/api/messenger/conversations", {
          kind: isGroup ? "group" : "direct",
          member_ids: selected,
          title: isGroup ? title.trim() : null,
        });
        onDone(created.id);
      }
    } catch (err) {
      logError("Messenger", "대화방 만들기/참여자 추가 실패", err);
      setError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
      setBusy(false);
    }
  }

  const heading = mode === "add" ? "참여자 추가" : "새 대화";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div role="dialog" aria-label={heading} className="bg-surface rounded-2xl p-6 w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">
          {mode === "add" ? "그룹 대화에 추가할 직원을 고르세요. 이전 대화 내용도 볼 수 있습니다." : "한 명을 고르면 1:1 대화, 두 명 이상 고르면 그룹 대화가 만들어집니다."}
        </p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 검색"
          aria-label="이름 검색"
          autoFocus
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary mb-2"
        />

        <div className="flex-1 min-h-[160px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
          {users === null && !error && <p className="p-3 text-sm text-text-muted">불러오는 중...</p>}
          {users !== null && candidates.length === 0 && <p className="p-3 text-sm text-text-muted">{mode === "add" ? "추가할 수 있는 직원이 없습니다." : "검색 결과가 없습니다."}</p>}
          {candidates.map((u) => (
            <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-bg">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} className="accent-primary" />
              <span className="text-sm font-medium">{u.name}</span>
              <span className="text-xs text-text-muted">{userLine(u)}</span>
            </label>
          ))}
        </div>

        {isGroup && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="그룹 대화 이름"
            aria-label="그룹 대화 이름"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary mt-3"
          />
        )}

        {error && (
          <p className="text-xs text-danger mt-3" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-text-muted">{selected.length}명 선택</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border text-sm px-4 py-2 hover:bg-bg">
              취소
            </button>
            <button type="button" onClick={() => void submit()} disabled={!canSubmit} className="rounded-lg bg-primary text-white text-sm font-medium px-4 py-2 hover:bg-primary-hover disabled:opacity-50">
              {busy ? "처리 중..." : mode === "add" ? "추가" : isGroup ? "그룹 대화 만들기" : "대화 시작"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
