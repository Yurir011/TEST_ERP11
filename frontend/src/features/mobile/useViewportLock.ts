import { useEffect } from "react";
import { logDebug } from "../../lib/logger";

/**
 * 모바일 화면에서 핀치 줌과 더블탭 확대를 막아 화면 크기를 고정한다.
 * - Android/Chrome: viewport 메타의 maximum-scale, user-scalable=no 와 touch-action 으로 막는다.
 * - iOS Safari는 user-scalable=no 를 무시하므로 gesturestart/다중 터치 이벤트를 직접 막는다.
 * 모바일 화면을 벗어나면(PC 화면으로 이동) 원래 설정으로 되돌린다.
 */
export function useViewportLock() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const original = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover");

    const html = document.documentElement;
    const originalTouchAction = html.style.touchAction;
    html.style.touchAction = "pan-x pan-y"; // 스크롤은 허용, 핀치/더블탭 줌은 차단

    const blockGesture = (e: Event) => e.preventDefault();
    const blockMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("gesturestart", blockGesture);
    document.addEventListener("gesturechange", blockGesture);
    document.addEventListener("touchmove", blockMultiTouch, { passive: false });
    logDebug("MobileViewport", "화면 크기 고정(줌 차단) 적용");

    return () => {
      if (meta && original !== null) meta.setAttribute("content", original);
      html.style.touchAction = originalTouchAction;
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("touchmove", blockMultiTouch);
      logDebug("MobileViewport", "화면 크기 고정 해제");
    };
  }, []);
}
