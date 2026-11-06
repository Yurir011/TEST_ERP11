import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiPost } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { ConversationList } from "../messenger/ConversationList";
import { DirectoryList } from "../messenger/DirectoryList";
import { MessageThread } from "../messenger/MessageThread";
import { NewConversationModal } from "../messenger/NewConversationModal";
import { favoritesOf } from "../messenger/presence";
import type { ConversationSummary } from "../messenger/types";
import { useMessenger } from "../messenger/useMessenger";
import { MobileLayout } from "./MobileLayout";
import { useViewportLock } from "./useViewportLock";

const LIST_PATH = "/m/messenger";

type ListTab = "chats" | "favorites" | "all";

const LIST_TABS: { key: ListTab; label: string }[] = [
  { key: "chats", label: "대화목록" },
  { key: "favorites", label: "즐겨찾기" },
  { key: "all", label: "전체목록" },
];

function ListScreen() {
  const dialog = useDialog();
  const navigate = useNavigate();
  const { conversations, unreadTotal, connection, refresh, directory, ensureDirectory, toggleFavorite } = useMessenger();
  const [tab, setTab] = useState<ListTab>("chats");
  const [showNew, setShowNew] = useState(false);

  // 직원별 현재 상태와 즐겨찾기는 이 화면이 열려 있는 동안 최신으로 유지한다
  useEffect(() => {
    ensureDirectory();
  }, [ensureDirectory]);

  /** 직원 이름을 누르면 그 사람과의 1:1 대화를 열고(없으면 만들고) 대화방으로 간다 */
  async function openDirect(userId: number) {
    try {
      logDebug("MobileMessenger", `1:1 대화 열기: user_id=${userId}`);
      const conv = await apiPost<ConversationSummary>("/api/messenger/conversations", { kind: "direct", member_ids: [userId], title: null });
      await refresh(); // 목록에 들어온 뒤에 이동한다 (먼저 이동하면 "없는 대화방"으로 보고 되돌려 보낸다)
      navigate(`${LIST_PATH}/${conv.id}`);
    } catch (err) {
      logError("MobileMessenger", "1:1 대화 열기 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "대화를 열지 못했습니다.");
    }
  }

  async function onToggleFavorite(userId: number, on: boolean) {
    try {
      await toggleFavorite(userId, on);
    } catch (err) {
      logError("MobileMessenger", "즐겨찾기 변경 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "즐겨찾기를 바꾸지 못했습니다.");
    }
  }

  const favorites = favoritesOf(directory);
  const connected = connection.state === "connected";

  return (
    <MobileLayout
      title="메신저"
      right={
        <span className="flex items-center gap-1.5 text-[11px] text-text-muted pr-3">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-success" : "bg-tile-orange-fg"}`} aria-hidden />
          {connected ? "실시간 연결됨" : "연결하는 중..."}
        </span>
      }
    >
      <div className="messenger-theme">
        <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col h-[calc(100dvh-13rem)] min-h-[320px]">
          <div role="tablist" aria-label="메신저 목록" className="flex border-b border-border shrink-0">
            {LIST_TABS.map(({ key, label }) => {
              const count = key === "chats" ? unreadTotal : key === "favorites" ? favorites.length : 0;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-3 text-sm flex items-center justify-center gap-1.5 border-b-2 -mb-px ${
                    tab === key ? "border-[#f59f00] text-text font-medium" : "border-transparent text-text-muted"
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center bg-badge-bg border border-badge-border text-badge-fg">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {tab === "chats" && (
            <ConversationList conversations={conversations} activeId={null} onSelect={(id) => navigate(`${LIST_PATH}/${id}`)} onNew={() => setShowNew(true)} />
          )}
          {tab === "favorites" && (
            <DirectoryList users={directory ? favorites : null} mode="favorites" onOpen={(id) => void openDirect(id)} onToggleFavorite={(id, on) => void onToggleFavorite(id, on)} />
          )}
          {tab === "all" && (
            <DirectoryList users={directory} mode="all" onOpen={(id) => void openDirect(id)} onToggleFavorite={(id, on) => void onToggleFavorite(id, on)} />
          )}
        </div>
      </div>

      {showNew && (
        <NewConversationModal
          mode="create"
          onClose={() => setShowNew(false)}
          onDone={(id) => {
            setShowNew(false);
            // 목록을 새로 받은 뒤에 이동한다. 먼저 이동하면 새 대화방이 아직 목록에 없어 "없는 대화방"으로 보고 되돌려 보낸다.
            void refresh().then(() => navigate(`${LIST_PATH}/${id}`));
          }}
        />
      )}
    </MobileLayout>
  );
}

function ThreadScreen({ id }: { id: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { conversations } = useMessenger();
  useViewportLock();

  const active = conversations?.find((c) => c.id === id) ?? null;
  const missing = conversations !== null && active === null;

  // 없는 대화방 주소(나간 대화방, 지워진 주소)는 목록으로 돌려보낸다
  useEffect(() => {
    if (missing) navigate(LIST_PATH, { replace: true });
  }, [missing, navigate]);

  if (!user) return null;

  return (
    <div className="messenger-theme h-dvh flex flex-col bg-bg pt-[env(safe-area-inset-top)]">
      <div className="flex-1 min-h-0 bg-surface pb-[env(safe-area-inset-bottom)]">
        {active ? (
          <MessageThread
            key={active.id}
            conversation={active}
            meId={user.id}
            leaveTo={LIST_PATH}
            onBack={() => {
              logDebug("MobileMessenger", "대화방 → 대화목록 (헤더 뒤로가기)");
              navigate(LIST_PATH);
            }}
          />
        ) : (
          <p className="p-6 text-sm text-text-muted text-center">불러오는 중...</p>
        )}
      </div>
    </div>
  );
}

/** 모바일 메신저: PC 메신저와 같은 대화방·메시지·실시간 연결을 쓰고, 목록과 대화 화면을 따로 보여 준다. */
export function MobileMessengerPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const id = conversationId ? Number(conversationId) : null;
  return id !== null && Number.isSafeInteger(id) ? <ThreadScreen id={id} /> : <ListScreen />;
}
