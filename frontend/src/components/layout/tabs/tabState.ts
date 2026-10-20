/**
 * 화면 탭 상태. 사이드바 메뉴를 누를 때마다 화면이 사라지지 않도록, 열어 둔 화면을 탭으로 유지한다.
 * 탭마다 자기만의 이동 기록(뒤로가기 포함)을 가지며, 여기는 그 상태를 바꾸는 순수 함수만 둔다.
 */

export interface TabLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
}

export interface Tab {
  id: number;
  entries: TabLocation[];
  index: number;
  title: string;
  /** 올라갈 때마다 탭 화면을 처음부터 다시 그린다 (새로고침) */
  reloadKey: number;
}

export interface TabsState {
  tabs: Tab[];
  activeId: number;
  nextId: number;
  seq: number;
}

export type TabsAction =
  | { type: "open"; to: string; preserve: boolean }
  | { type: "activate"; id: number }
  | { type: "close"; id: number }
  | { type: "push"; id: number; to: PathLike; state?: unknown }
  | { type: "replace"; id: number; to: PathLike; state?: unknown }
  | { type: "go"; id: number; delta: number }
  | { type: "reload"; id: number }
  | { type: "title"; id: number; title: string };

export interface PathLike {
  pathname?: string;
  search?: string;
  hash?: string;
}

/** "/clients/5?x=1#a" → { pathname, search, hash } */
export function parsePathString(path: string): Required<PathLike> {
  let rest = path;
  let hash = "";
  let search = "";
  const hashAt = rest.indexOf("#");
  if (hashAt >= 0) {
    hash = rest.slice(hashAt);
    rest = rest.slice(0, hashAt);
  }
  const searchAt = rest.indexOf("?");
  if (searchAt >= 0) {
    search = rest.slice(searchAt);
    rest = rest.slice(0, searchAt);
  }
  return { pathname: rest.startsWith("/") ? rest : `/${rest}`, search, hash };
}

export function toFullPath(loc: PathLike): string {
  return `${loc.pathname ?? "/"}${loc.search ?? ""}${loc.hash ?? ""}`;
}

/** 같은 메뉴(첫 경로 조각)에 속한 화면인지 판단하는 기준. 예: /clients, /clients/5, /clients/new 는 모두 "clients" */
export function sectionOf(pathname: string): string {
  return pathname.split("/")[1] ?? "";
}

export function currentLocation(tab: Tab): TabLocation {
  return tab.entries[tab.index];
}

export function currentPath(tab: Tab): string {
  return toFullPath(currentLocation(tab));
}

export function activeTab(state: TabsState): Tab {
  return state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0];
}

function makeLocation(to: PathLike, state: unknown, seq: number): TabLocation {
  return {
    pathname: to.pathname ?? "/",
    search: to.search ?? "",
    hash: to.hash ?? "",
    state: state ?? null,
    key: `t${seq}`,
  };
}

export function initialTabsState(path: string): TabsState {
  const tab: Tab = {
    id: 1,
    entries: [makeLocation(parsePathString(path), null, 0)],
    index: 0,
    title: "",
    reloadKey: 0,
  };
  return { tabs: [tab], activeId: 1, nextId: 2, seq: 1 };
}

function updateTab(state: TabsState, id: number, fn: (tab: Tab, seq: number) => Tab): TabsState {
  if (!state.tabs.some((t) => t.id === id)) return state;
  return { ...state, tabs: state.tabs.map((t) => (t.id === id ? fn(t, state.seq) : t)), seq: state.seq + 1 };
}

function navigateTab(tab: Tab, to: PathLike, navState: unknown, seq: number, replace: boolean): Tab {
  const next = makeLocation(to, navState, seq);
  const cur = currentLocation(tab);
  // 같은 주소로 또 이동하면 기록을 쌓지 않고 덮어쓴다 (같은 링크를 연달아 눌러도 뒤로가기가 늘어나지 않게)
  const same = toFullPath(next) === toFullPath(cur);
  if (replace || same) {
    const entries = tab.entries.slice();
    entries[tab.index] = next;
    return { ...tab, entries };
  }
  const entries = [...tab.entries.slice(0, tab.index + 1), next];
  return { ...tab, entries, index: entries.length - 1 };
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "open": {
      const target = parsePathString(action.to);
      const found = state.tabs.find((t) => sectionOf(currentLocation(t).pathname) === sectionOf(target.pathname));
      if (!found) {
        const tab: Tab = {
          id: state.nextId,
          entries: [makeLocation(target, null, state.seq)],
          index: 0,
          title: "",
          reloadKey: 0,
        };
        return { tabs: [...state.tabs, tab], activeId: tab.id, nextId: state.nextId + 1, seq: state.seq + 1 };
      }
      const wasActive = found.id === state.activeId;
      const activated = { ...state, activeId: found.id };
      // 다른 탭에 있다가 메뉴로 돌아오는 경우에는 보던 화면을 그대로 두고, 이미 보고 있는 탭의 메뉴를 다시 누르면 그 메뉴의 첫 화면으로 간다.
      if (action.preserve && !wasActive) return activated;
      if (currentPath(found) === toFullPath(target)) return activated;
      return updateTab(activated, found.id, (t, seq) => navigateTab(t, target, null, seq, false));
    }
    case "activate":
      return state.tabs.some((t) => t.id === action.id) ? { ...state, activeId: action.id } : state;
    case "close": {
      if (state.tabs.length <= 1) return state;
      const at = state.tabs.findIndex((t) => t.id === action.id);
      if (at < 0) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      const activeId = state.activeId === action.id ? tabs[Math.min(at, tabs.length - 1)].id : state.activeId;
      return { ...state, tabs, activeId };
    }
    case "push":
      return updateTab(state, action.id, (t, seq) => navigateTab(t, action.to, action.state, seq, false));
    case "replace":
      return updateTab(state, action.id, (t, seq) => navigateTab(t, action.to, action.state, seq, true));
    case "go":
      return updateTab(state, action.id, (t, seq) => {
        const index = t.index + action.delta;
        if (index >= 0 && index < t.entries.length) return { ...t, index };
        if (index >= t.entries.length) return t;
        // 이동 기록이 더 없는 뒤로가기: 막히지 않도록 그 메뉴의 첫 화면으로 보낸다
        const section = sectionOf(currentLocation(t).pathname);
        return navigateTab(t, { pathname: section ? `/${section}` : "/" }, null, seq, false);
      });
    case "reload":
      return updateTab(state, action.id, (t) => ({ ...t, reloadKey: t.reloadKey + 1 }));
    case "title":
      return state.tabs.find((t) => t.id === action.id)?.title === action.title
        ? state
        : updateTab(state, action.id, (t) => ({ ...t, title: action.title }));
  }
}
