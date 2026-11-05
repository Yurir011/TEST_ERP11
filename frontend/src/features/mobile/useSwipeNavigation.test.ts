import { describe, expect, it } from "vitest";
import { classifySwipe } from "./useSwipeNavigation";

describe("classifySwipe", () => {
  it("왼쪽 가장자리에서 오른쪽으로 밀면 뒤로가기", () => {
    expect(classifySwipe(10, 300, 150, 310, 200)).toBe("back");
  });
  it("가장자리가 아닌 곳에서 오른쪽으로 밀면 이전 탭, 왼쪽으로 밀면 다음 탭", () => {
    expect(classifySwipe(150, 300, 260, 305, 200)).toBe("prev");
    expect(classifySwipe(260, 300, 120, 305, 200)).toBe("next");
  });
  it("짧거나, 세로로 더 많이 움직이거나, 너무 느리면 스와이프가 아니다", () => {
    expect(classifySwipe(150, 300, 190, 300, 100)).toBeNull();
    expect(classifySwipe(150, 300, 260, 420, 200)).toBeNull();
    expect(classifySwipe(150, 300, 300, 300, 1500)).toBeNull();
  });
});
