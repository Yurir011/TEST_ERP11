import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { logDebug } from "../../lib/logger";
import { tabPaths } from "./MobileTabBar";

export type SwipeKind = "back" | "next" | "prev" | null;

const EDGE_PX = 28; // 화면 왼쪽 가장자리로 인정하는 폭 (뒤로가기 스와이프의 시작점)
const MIN_DX = 70;
const MAX_MS = 900;

/**
 * 손가락이 움직인 거리로 어떤 스와이프인지 판단한다.
 * - back: 왼쪽 가장자리에서 시작해 오른쪽으로 민다 (이전 화면)
 * - next / prev: 가로로 충분히 길고 세로보다 확실히 가로일 때 왼쪽으로 밀면 다음 탭, 오른쪽으로 밀면 이전 탭
 * 세로 스크롤 중 살짝 비껴 움직인 것은 스와이프로 보지 않는다.
 */
export function classifySwipe(startX: number, startY: number, endX: number, endY: number, ms: number): SwipeKind {
  const dx = endX - startX;
  const dy = endY - startY;
  if (ms > MAX_MS || Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 2) return null;
  if (dx > 0 && startX <= EDGE_PX) return "back";
  return dx < 0 ? "next" : "prev";
}

/** 스와이프를 시작한 곳이 입력칸이거나 옆으로 스크롤되는 영역이면 화면 이동으로 쓰지 않는다 (글 선택·표 스크롤과 겹치지 않게). */
export function isSwipeBlocked(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el.matches("input, textarea, select, [data-no-swipe]")) return true;
    if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * 모바일 화면의 스와이프 이동: 왼쪽 가장자리에서 밀면 뒤로, 하단 탭(홈·결재·서류·알림) 화면에서는 좌우로 밀어 옆 탭으로 간다.
 * backTo 가 없으면(홈) 뒤로가기 스와이프는 하지 않는다.
 */
export function useSwipeNavigation(backTo?: string) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isSiteAdmin = user?.role === "site_admin";

  useEffect(() => {
    const tabs = tabPaths(isSiteAdmin);
    let start: { x: number; y: number; t: number; blocked: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start = null;
        return;
      }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: Date.now(), blocked: isSwipeBlocked(e.target) };
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s || s.blocked || e.changedTouches.length === 0) return;
      const t = e.changedTouches[0];
      const kind = classifySwipe(s.x, s.y, t.clientX, t.clientY, Date.now() - s.t);
      if (!kind) return;
      if (kind === "back") {
        if (!backTo) return;
        logDebug("MobileSwipe", `뒤로가기 스와이프: ${pathname} → ${backTo}`);
        navigate(backTo);
        return;
      }
      const i = tabs.indexOf(pathname);
      if (i < 0) return; // 탭 화면이 아니면 좌우 이동은 하지 않는다
      const to = tabs[kind === "next" ? i + 1 : i - 1];
      if (!to) return;
      logDebug("MobileSwipe", `탭 스와이프(${kind}): ${pathname} → ${to}`);
      navigate(to);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", () => (start = null), { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [navigate, pathname, backTo, isSiteAdmin]);
}
