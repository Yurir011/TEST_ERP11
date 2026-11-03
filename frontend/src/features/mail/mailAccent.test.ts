// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MAIL_ACCENT,
  MAIL_ACCENT_EVENT,
  MAIL_ACCENTS,
  accentAsText,
  contrastRatio,
  isCustomAccent,
  loadMailAccent,
  mailAccentStyle,
  resolveMailAccent,
  saveMailAccent,
  textOnAccent,
} from "./mailAccent";

describe("mailAccent", () => {
  beforeEach(() => localStorage.clear());

  it("강조색은 6가지이고 핑크가 들어 있다", () => {
    expect(MAIL_ACCENTS).toHaveLength(6);
    expect(MAIL_ACCENTS.some((a) => a.id === "pink")).toBe(true);
  });

  it("저장한 색을 불러오고, 없거나 잘못된 값이면 기본색", () => {
    expect(loadMailAccent()).toBe(DEFAULT_MAIL_ACCENT);
    saveMailAccent("wine");
    expect(loadMailAccent()).toBe("wine");
    localStorage.setItem("bench.mail.accent", "없는색");
    expect(loadMailAccent()).toBe(DEFAULT_MAIL_ACCENT);
  });

  it("직접 고른 색(#rrggbb)도 저장하고 불러온다", () => {
    expect(isCustomAccent("#ff8800")).toBe(true);
    expect(isCustomAccent("#ff88")).toBe(false);
    expect(isCustomAccent("wine")).toBe(false);
    saveMailAccent("#ff8800");
    expect(loadMailAccent()).toBe("#ff8800");
  });

  it("고른 색이 Tailwind 색 변수로 나온다", () => {
    const style = mailAccentStyle("pink") as Record<string, string>;
    expect(style["--color-primary"]).toBe("#b0609f");
    expect(style["--color-primary-hover"]).toBe("#96508a");
    expect(style["--color-on-primary"]).toBe("#ffffff");
  });

  it("6가지 견본은 모두 흰 글씨를 쓴다", () => {
    for (const a of MAIL_ACCENTS) expect(textOnAccent(a.primary)).toBe("#ffffff");
  });

  it("밝은 색(노랑·연하늘)은 글씨가 어두운 색으로 바뀐다", () => {
    expect(textOnAccent("#ffd700")).toBe("#1f2024");
    expect(textOnAccent("#a8e6cf")).toBe("#1f2024");
    expect(resolveMailAccent("#ffd700").on).toBe("#1f2024");
    // 어두운 글씨는 밝은 바탕 위에서 충분히 읽힌다
    expect(contrastRatio("#ffd700", "#1f2024")).toBeGreaterThan(7);
  });

  it("밝은 색의 링크 글자는 흰 바탕에서 읽히도록 어둡게 보정된다", () => {
    const text = accentAsText("#ffd700");
    expect(contrastRatio(text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(accentAsText("#4b5fd6")).toBe("#4b5fd6"); // 이미 진한 색은 그대로
  });

  it("직접 고른 색의 눌림 색은 더 진하다", () => {
    const r = resolveMailAccent("#ff8800");
    expect(r.primary).toBe("#ff8800");
    expect(r.hover).not.toBe(r.primary);
    expect(contrastRatio(r.hover, "#ffffff")).toBeGreaterThan(contrastRatio(r.primary, "#ffffff"));
  });

  it("색을 저장하면 탭이 따라갈 수 있게 알림 이벤트를 보낸다", () => {
    let count = 0;
    const on = () => count++;
    window.addEventListener(MAIL_ACCENT_EVENT, on);
    saveMailAccent("teal");
    window.removeEventListener(MAIL_ACCENT_EVENT, on);
    expect(count).toBe(1);
  });
});
