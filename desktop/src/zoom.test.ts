import { describe, expect, it } from "vitest";

import { DEFAULT_ZOOM, type KeyInput, ZOOM_STEPS, sanitizeZoom, stepZoom, zoomKeyAction } from "./zoom";

const key = (over: Partial<KeyInput>): KeyInput => ({ type: "keyDown", key: "", code: "", control: true, meta: false, alt: false, ...over });

describe("확대·축소 단축키", () => {
  it("Ctrl + / = 는 확대, Ctrl - 는 축소, Ctrl 0 은 원래 크기", () => {
    expect(zoomKeyAction(key({ key: "+" }))).toBe("in");
    expect(zoomKeyAction(key({ key: "=" }))).toBe("in");
    expect(zoomKeyAction(key({ key: "-" }))).toBe("out");
    expect(zoomKeyAction(key({ key: "_" }))).toBe("out");
    expect(zoomKeyAction(key({ key: "0" }))).toBe("reset");
  });

  it("숫자패드와 맥의 ⌘ 도 된다", () => {
    expect(zoomKeyAction(key({ key: "Add", code: "NumpadAdd" }))).toBe("in");
    expect(zoomKeyAction(key({ key: "Subtract", code: "NumpadSubtract" }))).toBe("out");
    expect(zoomKeyAction(key({ key: "0", code: "Numpad0" }))).toBe("reset");
    expect(zoomKeyAction(key({ key: "+", control: false, meta: true }))).toBe("in");
  });

  it("Ctrl 없이, 키를 뗄 때, Alt 와 함께, 다른 키는 무시한다", () => {
    expect(zoomKeyAction(key({ key: "+", control: false }))).toBeNull();
    expect(zoomKeyAction(key({ key: "-", type: "keyUp" }))).toBeNull();
    expect(zoomKeyAction(key({ key: "-", alt: true }))).toBeNull();
    expect(zoomKeyAction(key({ key: "a" }))).toBeNull();
    expect(zoomKeyAction(key({ key: "1" }))).toBeNull();
  });
});

describe("배율 단계", () => {
  it("100% 에서 확대하면 110%, 축소하면 90% (브라우저와 같다)", () => {
    expect(stepZoom(1, "in")).toBe(1.1);
    expect(stepZoom(1, "out")).toBe(0.9);
  });

  it("처음 크기로 돌리면 100%", () => {
    expect(stepZoom(2, "reset")).toBe(DEFAULT_ZOOM);
  });

  it("양 끝에서는 더 가지 않는다", () => {
    expect(stepZoom(5, "in")).toBe(5);
    expect(stepZoom(0.25, "out")).toBe(0.25);
  });

  it("단계 사이의 값이면 가장 가까운 단계에서 이어 간다", () => {
    expect(stepZoom(1.12, "in")).toBe(1.25);
    expect(stepZoom(1.12, "out")).toBe(1);
  });

  it("연속으로 눌러도 모든 단계를 지난다", () => {
    let z = 1;
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) seen.push((z = stepZoom(z, "in")));
    expect(new Set(seen)).toEqual(new Set(ZOOM_STEPS.filter((s) => s > 1)));
  });
});

describe("저장된 배율 검사", () => {
  it("범위 안의 숫자만 받고 나머지는 100%", () => {
    expect(sanitizeZoom(1.5)).toBe(1.5);
    for (const v of [0, 0.1, 6, NaN, Infinity, "1.5", null, undefined]) expect(sanitizeZoom(v), String(v)).toBe(1);
  });
});
