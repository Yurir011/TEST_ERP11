import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getBenchClient } from "../../lib/desktop";

/**
 * 데스크톱 앱에서 메시지 알림을 눌렀을 때, 앱이 보내 주는 신호를 받아 그 대화방으로 이동한다 (화면을 새로 불러오지 않는다).
 * 앱이 아니면 아무 일도 하지 않는다. 번호가 이상하면 무시한다. 로그인 전이면 로그인 화면이 먼저 나온다.
 */
export function useOpenConversationFromDesktop() {
  const navigate = useNavigate();
  useEffect(() => {
    const bench = getBenchClient();
    if (!bench) return;
    return bench.onOpenConversation(({ conversationId }) => {
      if (Number.isSafeInteger(conversationId) && conversationId >= 1) navigate(`/messenger/${conversationId}`);
    });
  }, [navigate]);
}
