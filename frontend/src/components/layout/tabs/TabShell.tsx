import {
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  FileSignature,
  FileText,
  LayoutGrid,
  LogOut,
  Mail,
  MessageCircle,
  Receipt,
  RotateCw,
  ScrollText,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  NavigationType,
  Navigate,
  UNSAFE_LocationContext,
  UNSAFE_NavigationContext,
  UNSAFE_RouteContext,
  useLocation,
  useNavigate,
  type Navigator,
} from "react-router-dom";
import { useAuth } from "../../../context/useAuth";
import { DesktopUpdateNotice } from "../../../features/desktop/DesktopUpdateNotice";
import { PresenceSelect } from "../../../features/messenger/PresenceSelect";
import { useMessengerOptional } from "../../../features/messenger/useMessenger";
import { shouldUseMobile } from "../../../features/mobile/mobileMode";
import { TITLE_LABELS } from "../../../lib/auth";
import { Sidebar } from "../Sidebar";
import { SiteAdminSidebar } from "../SiteAdminSidebar";
import {
  activeTab,
  currentLocation,
  initialTabsState,
  parsePathString,
  sectionOf,
  tabsReducer,
  toFullPath,
  type PathLike,
  type Tab,
} from "./tabState";
import { TabMenuContext, TabShellContext } from "./TabShellContext";

/** 화면이 제목을 알려 주기 전(불러오는 중)에 탭에 보여 줄 이름 */
const SECTION_LABELS: Record<string, string> = {
  "": "대시보드",
  schedule: "일정관리",
  messenger: "메신저",
  mail: "메일",
  approval: "전자결재",
  leaves: "연차",
  documents: "증명서",
  projects: "프로젝트관리",
  "project-documents": "문서관리",
  proposals: "제안서",
  clients: "거래처관리",
  "tax-invoices": "세금계산서",
  transactions: "매입매출관리",
  payments: "입출금관리",
  notices: "업무 알림",
  settings: "직원등록",
};

type TabColor = "blue" | "green" | "purple" | "orange";

/** 탭 색상별 클래스 (Tailwind 가 찾을 수 있게 전체 이름으로 적는다) */
const TAB_COLORS: Record<TabColor, { stripe: string; idle: string; on: string; icon: string; iconOn: string }> = {
  blue: { stripe: "border-t-tile-blue-fg", idle: "bg-surface", on: "bg-tile-blue", icon: "bg-tile-blue text-tile-blue-fg", iconOn: "bg-tile-blue-fg text-white" },
  green: { stripe: "border-t-tile-green-fg", idle: "bg-surface", on: "bg-tile-green", icon: "bg-tile-green text-tile-green-fg", iconOn: "bg-tile-green-fg text-white" },
  purple: { stripe: "border-t-tile-purple-fg", idle: "bg-surface", on: "bg-tile-purple", icon: "bg-tile-purple text-tile-purple-fg", iconOn: "bg-tile-purple-fg text-white" },
  orange: { stripe: "border-t-tile-orange-fg", idle: "bg-surface", on: "bg-tile-orange", icon: "bg-tile-orange text-tile-orange-fg", iconOn: "bg-tile-orange-fg text-white" },
};

/** 메뉴(첫 경로 조각)별 탭 아이콘과 색. 아이콘은 사이드바 메뉴와 같다 */
const SECTION_STYLE: Record<string, { icon: LucideIcon; color: TabColor }> = {
  "": { icon: LayoutGrid, color: "blue" },
  schedule: { icon: CalendarDays, color: "blue" },
  messenger: { icon: MessageCircle, color: "blue" },
  mail: { icon: Mail, color: "blue" },
  notices: { icon: Bell, color: "blue" },
  settings: { icon: Settings, color: "blue" },
  clients: { icon: Building2, color: "green" },
  transactions: { icon: Receipt, color: "green" },
  payments: { icon: Banknote, color: "green" },
  approval: { icon: FileSignature, color: "purple" },
  proposals: { icon: FileSignature, color: "purple" },
  leaves: { icon: CalendarDays, color: "purple" },
  documents: { icon: FileText, color: "purple" },
  "tax-invoices": { icon: ScrollText, color: "purple" },
  projects: { icon: FileText, color: "orange" },
  "project-documents": { icon: FileText, color: "orange" },
};
const DEFAULT_SECTION_STYLE = { icon: FileText, color: "blue" as TabColor };

/** 오른쪽 위의 내 상태 콤보박스(메신저와 같은 값). 상태와 실시간 변경을 받으려면 메신저의 직원 목록 구독이 필요해 켜 둔다. */
function TopBarStatus() {
  const messenger = useMessengerOptional();
  const ensureDirectory = messenger?.ensureDirectory;
  useEffect(() => {
    ensureDirectory?.();
  }, [ensureDirectory]);
  return messenger ? <PresenceSelect /> : null;
}

const pageFallback =<p className="p-8 text-sm text-text-muted">불러오는 중...</p>;

const pathSearch = (loc: { pathname: string; search: string }) => `${loc.pathname}${loc.search}`;

function tabLabel(tab: Tab): string {
  return tab.title || SECTION_LABELS[sectionOf(currentLocation(tab).pathname)] || "화면";
}

/** 탭 하나가 자기만의 주소·이동 기록을 갖도록, 라우터가 쓰는 주소/이동 정보를 탭 상태로 바꿔 끼운다 */
function TabRouter({ tab, dispatch, children }: { tab: Tab; dispatch: (a: Parameters<typeof tabsReducer>[1]) => void; children: ReactNode }) {
  const location = currentLocation(tab);
  const id = tab.id;
  const navigator = useMemo<Navigator>(
    () => ({
      createHref: (to) => (typeof to === "string" ? to : toFullPath(to)),
      encodeLocation: (to) => {
        const p: PathLike = typeof to === "string" ? parsePathString(to) : to;
        return { pathname: p.pathname ?? "", search: p.search ?? "", hash: p.hash ?? "" };
      },
      go: (delta) => dispatch({ type: "go", id, delta }),
      push: (to, state) => dispatch({ type: "push", id, to: typeof to === "string" ? parsePathString(to) : to, state }),
      replace: (to, state) => dispatch({ type: "replace", id, to: typeof to === "string" ? parsePathString(to) : to, state }),
    }),
    [dispatch, id],
  );
  const navigationValue = useMemo(() => ({ basename: "/", navigator, static: false, useTransitions: undefined, future: {} }), [navigator]);
  const locationValue = useMemo(() => ({ location, navigationType: NavigationType.Pop }), [location]);
  const routeValue = useMemo(() => ({ outlet: null, matches: [], isDataRoute: false }), []);
  const shellValue = useMemo(
    () => ({ tabId: id, setTitle: (title: string) => dispatch({ type: "title", id, title }) }),
    [dispatch, id],
  );
  return (
    <UNSAFE_NavigationContext.Provider value={navigationValue}>
      <UNSAFE_LocationContext.Provider value={locationValue}>
        <UNSAFE_RouteContext.Provider value={routeValue}>
          <TabShellContext.Provider value={shellValue}>{children}</TabShellContext.Provider>
        </UNSAFE_RouteContext.Provider>
      </UNSAFE_LocationContext.Provider>
    </UNSAFE_NavigationContext.Provider>
  );
}

/**
 * 로그인한 PC 화면의 틀: 사이드바 + 탭 막대 + 열어 둔 화면들.
 * 사이드바 메뉴를 누르면 새 탭으로 열고, 닫지 않은 탭은 화면 상태(입력 중인 내용, 목록, 필터)를 그대로 유지한 채 숨겨 둔다.
 * 주소창의 주소는 지금 보고 있는 탭의 주소와 맞춰 둔다 (새로고침하거나 주소를 공유해도 같은 화면이 열리도록).
 */
export function TabShell({ routes }: { routes: ReactNode }) {
  const { user, logout } = useAuth();
  const outer = useLocation();
  const outerNavigate = useNavigate();
  const [state, dispatch] = useReducer(tabsReducer, pathSearch(outer), initialTabsState);
  const stateRef = useRef(state);
  const scrollByTab = useRef(new Map<number, number>());
  const shownTabId = useRef(state.activeId);

  const active = activeTab(state);
  const activePathSearch = pathSearch(currentLocation(active));

  useEffect(() => {
    stateRef.current = state;
  });

  // 주소창이 밖에서 바뀐 경우(처음 접속, 데스크톱 알림, 브라우저 뒤로가기): 그 주소를 맞는 탭에서 연다
  useEffect(() => {
    const wanted = pathSearch(outer);
    if (wanted === pathSearch(currentLocation(activeTab(stateRef.current)))) return;
    console.debug(`[Tabs] 주소 변경 → 탭 열기: ${wanted}`);
    dispatch({ type: "open", to: wanted, preserve: false });
    // 주소가 바뀔 때만 반응한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outer.pathname, outer.search]);

  // 지금 보는 탭의 주소를 주소창에 반영한다
  useEffect(() => {
    if (activePathSearch === pathSearch(outer)) return;
    console.debug(`[Tabs] 탭 주소 → 주소창: ${activePathSearch}`);
    outerNavigate(activePathSearch, { replace: true });
    // 탭의 주소가 바뀔 때만 반응한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePathSearch]);

  // 탭을 옮길 때 스크롤 위치를 탭별로 기억했다가 돌려준다
  useLayoutEffect(() => {
    if (shownTabId.current === state.activeId) return;
    scrollByTab.current.set(shownTabId.current, window.scrollY);
    shownTabId.current = state.activeId;
    window.scrollTo(0, scrollByTab.current.get(state.activeId) ?? 0);
  }, [state.activeId]);

  const openMenu = useCallback((to: string) => {
    console.debug(`[Tabs] 메뉴 클릭: ${to}`);
    dispatch({ type: "open", to, preserve: true });
  }, []);
  const menuValue = useMemo(() => ({ openMenu }), [openMenu]);

  if (shouldUseMobile() && outer.pathname === "/") return <Navigate to="/m" replace />;

  return (
    <TabMenuContext.Provider value={menuValue}>
      <div className="flex min-h-screen">
        {user?.role === "site_admin" ? <SiteAdminSidebar /> : <Sidebar />}
        <div className="flex-1 min-w-0">
          <div className="sticky top-0 z-30 flex items-end gap-3 bg-sidebar border-b border-border pl-3 pr-6 pt-2.5">
            <div
              role="tablist"
              className="flex items-end gap-1 min-w-0 flex-1"
            >
              {state.tabs.map((tab) => {
                const isActive = tab.id === state.activeId;
                // 메뉴마다 아이콘과 색이 달라 탭이 여러 개여도 한눈에 구분된다. 보고 있는 탭은 그 색으로 채워진다.
                const style = SECTION_STYLE[sectionOf(currentLocation(tab).pathname)] ?? DEFAULT_SECTION_STYLE;
                const color = TAB_COLORS[style.color];
                const Icon = style.icon;
                return (
                  // 탭이 많아지면 익스플로러·크롬처럼 폭이 고르게 좁아져서 모두 보인다 (기본 220px → 최소 34px, 보고 있는 탭은 88px).
                  // 폭이 좁아지면 이름(76px 미만)과 닫기 버튼(110px 미만, 보고 있는 탭은 항상)을 차례로 숨기고 아이콘만 남는다.
                  <div
                    key={tab.id}
                    onClick={() => dispatch({ type: "activate", id: tab.id })}
                    title={tabLabel(tab)}
                    className={`@container/tab group flex items-center gap-2 min-w-0 flex-[0_1_220px] ${isActive ? "min-w-[88px]" : "min-w-[34px]"} cursor-pointer rounded-t-lg border border-b-0 border-t-[3px] border-border ${color.stripe} pl-2.5 pr-2 pt-2 text-sm text-text ${
                      isActive ? `${color.on} -mb-px pb-2.5 font-semibold` : `${color.idle} pb-2 opacity-75 hover:opacity-100`
                    }`}
                  >
                    <span className={`grid place-items-center w-[22px] h-[22px] rounded-md shrink-0 ${isActive ? color.iconOn : color.icon}`}>
                      <Icon size={13} />
                    </span>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => dispatch({ type: "activate", id: tab.id })}
                      className="hidden @min-[76px]/tab:block min-w-0 flex-1 truncate text-left"
                    >
                      {tabLabel(tab)}
                    </button>
                    {state.tabs.length > 1 && (
                      <button
                        type="button"
                        aria-label={`${tabLabel(tab)} 탭 닫기`}
                        onClick={(e) => {
                          e.stopPropagation(); // 탭 누름(이 탭으로 이동)으로 퍼지지 않게
                          console.debug(`[Tabs] 탭 닫기: id=${tab.id}, ${tabLabel(tab)}`);
                          dispatch({ type: "close", id: tab.id });
                        }}
                        className={`${isActive ? "" : "hidden @min-[110px]/tab:block"} shrink-0 rounded p-0.5 text-text-muted hover:bg-border hover:text-text ml-auto`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 shrink-0 pb-2">
              <button
                type="button"
                onClick={() => dispatch({ type: "reload", id: state.activeId })}
                title="이 탭 새로고침"
                aria-label="이 탭 새로고침"
                className="p-1 rounded text-text-muted hover:text-text hover:bg-surface"
              >
                <RotateCw size={14} />
              </button>
              {user && (
                <>
                  <span className="text-sm text-text whitespace-nowrap">
                    {user.name} <span className="text-text-muted">{user.title ? TITLE_LABELS[user.title] : "사원"}</span>
                  </span>
                  <TopBarStatus />
                  <span className="w-px h-4 bg-border" />
                  <button
                    onClick={logout}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-danger transition-colors whitespace-nowrap"
                  >
                    <LogOut size={13} />
                    로그아웃
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="px-10 empty:hidden">
            <DesktopUpdateNotice />
          </div>
          {state.tabs.map((tab) => (
            <div key={tab.id} hidden={tab.id !== state.activeId}>
              <TabRouter key={tab.reloadKey} tab={tab} dispatch={dispatch}>
                <Suspense fallback={pageFallback}>{routes}</Suspense>
              </TabRouter>
            </div>
          ))}
        </div>
      </div>
    </TabMenuContext.Provider>
  );
}
