// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UI_THEMES, applyUiTheme, isUiThemeKey, loadUiTheme, saveUiTheme } from "./uiTheme";

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#f7f7f8" />';
  localStorage.clear();
});
afterEach(() => applyUiTheme("classic"));

const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute("content");

describe("uiTheme", () => {
  it("저장된 값이 없거나 알 수 없으면 클래식 블루로 시작한다", () => {
    expect(loadUiTheme()).toBe("classic");
    localStorage.setItem("bench_ui_theme", "nope");
    expect(loadUiTheme()).toBe("classic");
  });

  it("고른 테마는 이 기기에 기억된다", () => {
    saveUiTheme("hotpink");
    expect(loadUiTheme()).toBe("hotpink");
  });

  it("라이트 테마를 적용하면 색 변수가 바뀌고, 다른 테마로 바꾸면 이전 값이 남지 않는다", () => {
    const html = document.documentElement;
    applyUiTheme("midnight");
    expect(html.style.getPropertyValue("--color-bg")).toBe("#0f172a");
    expect(html.dataset.uiTheme).toBe("midnight");
    expect(html.dataset.uiDark).toBe("1");
    expect(html.style.colorScheme).toBe("dark");
    expect(html.style.getPropertyValue("--tm-mix")).toBe("30%");
    expect(meta()).toBe("#0f172a");

    applyUiTheme("mocha");
    expect(html.style.getPropertyValue("--color-primary")).toBe("#8c5a32");
    expect(html.style.getPropertyValue("--color-tile-red")).toBe("");
    expect(html.style.getPropertyValue("--tm-mix")).toBe("");
    expect(html.dataset.uiDark).toBeUndefined();
    expect(html.style.colorScheme).toBe("");

    applyUiTheme("classic");
    expect(html.style.getPropertyValue("--color-bg")).toBe("");
    expect(meta()).toBe("#f7f7f8");
  });

  it("테마 키는 서로 다르고 알 수 없는 키는 걸러낸다", () => {
    expect(new Set(UI_THEMES.map((t) => t.key)).size).toBe(UI_THEMES.length);
    expect(UI_THEMES.map((t) => t.key)).toEqual(["classic", "mocha", "rose", "lavender", "teal", "hotpink", "midnight"]);
    expect(isUiThemeKey("rose")).toBe(true);
    expect(isUiThemeKey("slate")).toBe(false);
    expect(isUiThemeKey(null)).toBe(false);
  });
});
