import { createContext, useContext } from "react";

export interface TabShellValue {
  /** 이 화면이 들어 있는 탭의 번호 */
  tabId: number;
  /** 탭 제목을 화면 제목으로 바꾼다 */
  setTitle: (title: string) => void;
}

/** 탭 안에서 그려질 때만 값이 있다 (로그인·모바일 화면 등 탭 밖에서는 null) */
export const TabShellContext = createContext<TabShellValue | null>(null);

export function useTabShell() {
  return useContext(TabShellContext);
}

export interface TabMenuValue {
  /** 사이드바 메뉴를 눌렀을 때: 그 메뉴의 탭을 앞으로 가져오거나 없으면 새 탭으로 연다 */
  openMenu: (to: string) => void;
}

export const TabMenuContext = createContext<TabMenuValue | null>(null);

export function useTabMenu() {
  return useContext(TabMenuContext);
}
