import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiPost } from "../../lib/api";
import { logError } from "../../lib/logger";
import { ConversationList } from "./ConversationList";
import { DirectoryList } from "./DirectoryList";
import { MessageThread } from "./MessageThread";
import { NewConversationModal } from "./NewConversationModal";
import { PresenceSelect } from "./PresenceSelect";
import { favoritesOf } from "./presence";
import type { ConversationSummary } from "./types";
import { useMessenger } from "./useMessenger";

type Tab = "chats" | "favorites" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "chats", label: "대화목록" },
  { key: "favorites", label: "즐겨찾기" },
  { key: "all", label: "전체목록" },
];

export function MessengerPage() {
  const { user } = useAuth();
  const dialog = useDialog();
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { conversations, unreadTotal, connection, refresh, directory, ensureDirectory, toggleFavorite } = useMessenger();
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<Tab>("chats");

  const activeId = conversationId ? Number(conversationId) : null;
  const active = conversations?.find((c) => c.id === activeId) ?? null;
  const missing = activeId !== null && conversations !== null && active === null;

  // 직원별 현재 상태와 즐겨찾기는 이 화면이 열려 있는 동안 최신으로 유지한다
  useEffect(() => {
    ensureDirectory();
  }, [ensureDirectory]);

  // 없는 대화방 주소(나간 대화방, 지워진 주소)는 목록으로 돌려보낸다
  useEffect(() => {
    if (missing) navigate("/messenger", { replace: true });
  }, [missing, navigate]);

  if (!user) return null;

  /** 직원 이름을 누르면 그 사람과의 1:1 대화를 열고(없으면 만들고) 대화목록 탭으로 간다 */
  async function openDirect(userId: number) {
    try {
      const conv = await apiPost<ConversationSummary>("/api/messenger/conversations", { kind: "direct", member_ids: [userId], title: null });
      await refresh(); // 목록에 들어온 뒤에 이동한다 (먼저 이동하면 "없는 대화방"으로 보고 되돌려 보낸다)
      setTab("chats");
      navigate(`/messenger/${conv.id}`);
    } catch (err) {
      logError("Messenger", "1:1 대화 열기 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "대화를 열지 못했습니다.");
    }
  }

  async function onToggleFavorite(userId: number, on: boolean) {
    try {
      await toggleFavorite(userId, on);
    } catch (err) {
      logError("Messenger", "즐겨찾기 변경 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "즐겨찾기를 바꾸지 못했습니다.");
    }
  }

  const favorites = favoritesOf(directory);
  const status =
    connection.state === "connected" ? (
      <span className="flex items-center gap-1.5 text-xs text-text-muted"><span className="w-2 h-2 rounded-full bg-success" />실시간 연결됨</span>
    ) : (
      <span className="flex items-center gap-1.5 text-xs text-text-muted"><span className="w-2 h-2 rounded-full bg-tile-orange-fg" />연결하는 중...</span>
    );

  return (
    <MainLayout
      title="메신저"
      description="동료와 1:1 또는 그룹으로 대화하고 파일을 주고받습니다."
      actions={
        <>
          {status}
          <PresenceSelect />
        </>
      }
    >
      <div className="flex gap-4 h-[calc(100vh-15rem)] min-h-[420px]">
        <aside className="w-80 shrink-0 bg-surface border border-border rounded-2xl flex flex-col overflow-hidden">
          <div role="tablist" aria-label="메신저 목록" className="flex border-b border-border">
            {TABS.map(({ key, label }) => {
              const count = key === "chats" ? unreadTotal : key === "favorites" ? favorites.length : 0;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-3 text-sm flex items-center justify-center gap-1.5 border-b-2 -mb-px transition-colors ${
                    tab === key ? "border-primary text-text font-medium" : "border-transparent text-text-muted hover:text-text"
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                        key === "chats" ? "bg-badge-bg border border-badge-border text-badge-fg" : "bg-bg border border-border text-text-muted"
                      }`}
                      aria-label={key === "chats" ? `안 읽은 메시지 ${count}개` : `즐겨찾기 ${count}명`}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {tab === "chats" && <ConversationList conversations={conversations} activeId={activeId} onSelect={(id) => navigate(`/messenger/${id}`)} onNew={() => setShowNew(true)} />}
          {tab === "favorites" && <DirectoryList users={directory ? favorites : null} mode="favorites" onOpen={(id) => void openDirect(id)} onToggleFavorite={(id, on) => void onToggleFavorite(id, on)} />}
          {tab === "all" && <DirectoryList users={directory} mode="all" onOpen={(id) => void openDirect(id)} onToggleFavorite={(id, on) => void onToggleFavorite(id, on)} />}
        </aside>
        <section className="flex-1 min-w-0 bg-surface border border-border rounded-2xl overflow-hidden">
          {active ? (
            <MessageThread key={active.id} conversation={active} meId={user.id} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-text-muted gap-2">
              <MessageCircle size={36} />
              <p className="text-sm">{conversations === null ? "불러오는 중..." : "왼쪽에서 대화를 고르거나 [새 대화]를 시작하세요."}</p>
            </div>
          )}
        </section>
      </div>

      {showNew && (
        <NewConversationModal
          mode="create"
          onClose={() => setShowNew(false)}
          onDone={(id) => {
            setShowNew(false);
            // 목록을 새로 받은 뒤에 이동한다. 먼저 이동하면 새 대화방이 아직 목록에 없어 "없는 대화방"으로 보고 되돌려 보낸다.
            void refresh().then(() => navigate(`/messenger/${id}`));
          }}
        />
      )}
    </MainLayout>
  );
}
