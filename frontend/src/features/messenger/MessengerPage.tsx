import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/useAuth";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { NewConversationModal } from "./NewConversationModal";
import { useMessenger } from "./useMessenger";

export function MessengerPage() {
  const { user } = useAuth();
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { conversations, connection, refresh } = useMessenger();
  const [showNew, setShowNew] = useState(false);

  const activeId = conversationId ? Number(conversationId) : null;
  const active = conversations?.find((c) => c.id === activeId) ?? null;
  const missing = activeId !== null && conversations !== null && active === null;

  // 없는 대화방 주소(나간 대화방, 지워진 주소)는 목록으로 돌려보낸다
  useEffect(() => {
    if (missing) navigate("/messenger", { replace: true });
  }, [missing, navigate]);

  if (!user) return null;

  const status =
    connection.state === "connected" ? (
      <span className="flex items-center gap-1.5 text-xs text-text-muted"><span className="w-2 h-2 rounded-full bg-success" />실시간 연결됨</span>
    ) : (
      <span className="flex items-center gap-1.5 text-xs text-text-muted"><span className="w-2 h-2 rounded-full bg-tile-orange-fg" />연결하는 중...</span>
    );

  return (
    <MainLayout title="메신저" description="동료와 1:1 또는 그룹으로 대화하고 파일을 주고받습니다." actions={status}>
      <div className="flex gap-4 h-[calc(100vh-15rem)] min-h-[420px]">
        <ConversationList conversations={conversations} activeId={activeId} onSelect={(id) => navigate(`/messenger/${id}`)} onNew={() => setShowNew(true)} />
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
