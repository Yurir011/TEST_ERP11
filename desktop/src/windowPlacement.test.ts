import { describe, expect, it } from "vitest";
import { isVisibleOnAnyDisplay } from "./windowPlacement";

const screen1 = { x: 0, y: 0, width: 1920, height: 1040 };
const screen2 = { x: 1920, y: 0, width: 1920, height: 1040 };

describe("창이 화면 안에 보이는지", () => {
  it("화면 안에 있으면 보인다", () => {
    expect(isVisibleOnAnyDisplay({ x: 100, y: 100, width: 1200, height: 800 }, [screen1])).toBe(true);
  });

  it("다른 모니터에 있으면 그 모니터가 연결돼 있을 때만 보인다", () => {
    const onSecond = { x: 2200, y: 100, width: 1200, height: 800 };
    expect(isVisibleOnAnyDisplay(onSecond, [screen1, screen2])).toBe(true);
    expect(isVisibleOnAnyDisplay(onSecond, [screen1])).toBe(false); // 모니터를 뺀 뒤에는 창이 화면 밖에 남는다
  });

  it("일부만 걸쳐 있어도 충분히 보이면 보이고, 모서리만 살짝 걸치면 안 보이는 것으로 본다", () => {
    expect(isVisibleOnAnyDisplay({ x: 1500, y: 100, width: 1200, height: 800 }, [screen1])).toBe(true);
    expect(isVisibleOnAnyDisplay({ x: 1900, y: 1030, width: 1200, height: 800 }, [screen1])).toBe(false);
  });
});
