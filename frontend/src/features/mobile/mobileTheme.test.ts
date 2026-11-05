// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MOBILE_THEMES, applyMobileTheme, clearMobileTheme, loadMobileTheme, saveMobileTheme } from "./mobileTheme";

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#f7f7f8" />';
  localStorage.clear();
});
afterEach(() => clearMobileTheme());

const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute("content");

describe("mobileTheme", () => {
  it("저장된 값이 없거나 알 수 없으면 기본 라이트로 시작한다", () => {
    expect(loadMobileTheme()).toBe("default");
    localStorage.setItem("bench_mobile_theme", "nope");
    expect(loadMobileTheme()).toBe("default");
  });

  it("고른 테마는 저장되어 다시 불러와도 유지된다", () => {
    saveMobileTheme("vivid");
    expect(loadMobileTheme()).toBe("vivid");
  });

  it("적용하면 색 변수·속성·상단 막대 색이 바뀌고, 다른 테마로 바꾸면 이전 값이 남지 않는다", () => {
    const html = document.documentElement;
    applyMobileTheme("slate");
    expect(html.style.getPropertyValue("--color-bg")).toBe("#16181c");
    expect(html.dataset.mobileTheme).toBe("slate");
    expect(html.style.colorScheme).toBe("dark");
    expect(meta()).toBe("#16181c");

    applyMobileTheme("default");
    expect(html.style.getPropertyValue("--color-bg")).toBe("");
    expect(html.style.getPropertyValue("--color-tile-red")).toBe("");
    expect(html.style.colorScheme).toBe("");
    expect(meta()).toBe("#f7f7f8");
  });

  it("해제하면 PC 화면용 기본 색으로 돌아간다", () => {
    applyMobileTheme("chic");
    clearMobileTheme();
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("");
    expect(document.documentElement.dataset.mobileTheme).toBeUndefined();
    expect(meta()).toBe("#f7f7f8");
  });

  it("테마 이름은 중복되지 않는다", () => {
    expect(new Set(MOBILE_THEMES.map((t) => t.key)).size).toBe(MOBILE_THEMES.length);
  });
});
