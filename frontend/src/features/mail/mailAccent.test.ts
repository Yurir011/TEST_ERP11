// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MAIL_ACCENT, MAIL_ACCENTS, loadMailAccent, mailAccentStyle, saveMailAccent } from "./mailAccent";

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

  it("고른 색이 Tailwind 색 변수로 나온다", () => {
    const style = mailAccentStyle("pink") as Record<string, string>;
    expect(style["--color-primary"]).toBe("#b0609f");
    expect(style["--color-primary-hover"]).toBe("#96508a");
  });
});
