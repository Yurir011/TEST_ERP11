import { describe, expect, it } from "vitest";
import { activeTab, currentPath, initialTabsState, tabsReducer, type TabsState } from "./tabState";

const open = (s: TabsState, to: string, preserve = true) => tabsReducer(s, { type: "open", to, preserve });

describe("탭 상태", () => {
  it("처음에는 접속한 주소 하나만 열려 있다", () => {
    const s = initialTabsState("/clients?q=a");
    expect(s.tabs).toHaveLength(1);
    expect(currentPath(activeTab(s))).toBe("/clients?q=a");
  });

  it("다른 메뉴를 누르면 새 탭이 열리고 기존 탭은 그대로 남는다", () => {
    const s = open(initialTabsState("/"), "/clients");
    expect(s.tabs).toHaveLength(2);
    expect(currentPath(activeTab(s))).toBe("/clients");
    expect(currentPath(s.tabs[0])).toBe("/");
  });

  it("이미 열린 메뉴로 돌아오면 보던 상세 화면을 그대로 보여 준다", () => {
    let s = open(initialTabsState("/clients"), "/projects");
    const clientsId = s.tabs[0].id;
    s = tabsReducer(s, { type: "push", id: clientsId, to: { pathname: "/clients/5" } });
    s = open(s, "/clients");
    expect(s.tabs).toHaveLength(2);
    expect(s.activeId).toBe(clientsId);
    expect(currentPath(activeTab(s))).toBe("/clients/5");
  });

  it("보고 있는 탭의 메뉴를 다시 누르면 그 메뉴의 첫 화면으로 간다", () => {
    let s = initialTabsState("/clients");
    s = tabsReducer(s, { type: "push", id: s.activeId, to: { pathname: "/clients/5" } });
    s = open(s, "/clients");
    expect(currentPath(activeTab(s))).toBe("/clients");
    expect(s.tabs).toHaveLength(1);
  });

  it("밖에서 온 이동(알림 등)은 열린 탭의 화면을 그 주소로 바꾼다", () => {
    let s = open(initialTabsState("/messenger"), "/clients");
    s = open(s, "/messenger/12", false);
    expect(s.tabs).toHaveLength(2);
    expect(currentPath(activeTab(s))).toBe("/messenger/12");
  });

  it("탭을 닫으면 이웃 탭이 앞으로 오고, 마지막 하나는 닫히지 않는다", () => {
    let s = open(open(initialTabsState("/"), "/clients"), "/projects");
    const [a, b, c] = s.tabs.map((t) => t.id);
    s = tabsReducer(s, { type: "close", id: c });
    expect(s.activeId).toBe(b);
    s = tabsReducer(s, { type: "close", id: b });
    s = tabsReducer(s, { type: "close", id: a });
    expect(s.tabs).toHaveLength(1);
  });

  it("뒤로가기는 탭 안의 기록을 따라가고, 기록이 없으면 메뉴 첫 화면으로 간다", () => {
    let s = initialTabsState("/clients/5/edit");
    const id = s.activeId;
    s = tabsReducer(s, { type: "go", id, delta: -1 });
    expect(currentPath(activeTab(s))).toBe("/clients");
    s = tabsReducer(s, { type: "push", id, to: { pathname: "/clients/7" } });
    s = tabsReducer(s, { type: "go", id, delta: -1 });
    expect(currentPath(activeTab(s))).toBe("/clients");
  });

  it("같은 주소로 다시 이동해도 이동 기록이 늘어나지 않는다", () => {
    let s = initialTabsState("/clients");
    const id = s.activeId;
    s = tabsReducer(s, { type: "push", id, to: { pathname: "/clients" } });
    expect(activeTab(s).entries).toHaveLength(1);
  });
});
