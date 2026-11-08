import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { logDebug } from "../../lib/logger";
import { isPushAvailable, listenPush, registerPush } from "../../lib/push";
import { toMobilePath } from "./mobilePaths";

/**
 * 모바일 앱의 푸시 알림: 로그인하면 이 기기의 토큰을 서버에 등록하고, 알림을 탭하면 해당 /m 화면으로 이동한다.
 * 앱이 아닌 일반 브라우저에서는 아무 일도 하지 않는다. (로그아웃 때의 토큰 해제는 AuthContext 의 logout 이 한다)
 */
export function useMobilePush() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userIdRef = useRef<number | null>(null);
  const pendingLink = useRef<{ link: string | null } | null>(null);
  userIdRef.current = user?.id ?? null;

  const goTo = (link: string | null) => {
    const target = toMobilePath(link) ?? "/m/notifications"; // 알 수 없는 경로면 알림 목록으로
    logDebug("Push", `알림 탭 이동: ${link} → ${target}`);
    navigate(target);
  };

  // 알림 탭 / 토큰 갱신 듣기 (앱이 켜져 있는 동안 한 번)
  useEffect(() => {
    if (!isPushAvailable()) return;
    return listenPush(
      (link) => {
        if (userIdRef.current !== null) goTo(link);
        else pendingLink.current = { link }; // 종료 상태에서 탭해 시작됨: 로그인이 확인된 뒤에 이동한다
      },
      () => userIdRef.current !== null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 로그인하면 토큰 등록, 그리고 로그인 전에 받아 둔 알림 탭을 이어서 처리
  useEffect(() => {
    if (!user || !isPushAvailable()) return;
    void registerPush();
    if (pendingLink.current) {
      const { link } = pendingLink.current;
      pendingLink.current = null;
      goTo(link);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
