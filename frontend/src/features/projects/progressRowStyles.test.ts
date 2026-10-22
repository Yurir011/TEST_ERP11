import { describe, expect, it } from "vitest";
import { PROGRESS_ROW_STYLES, stageColorIndex } from "./progressRowStyles";

describe("진행상황 항목 색", () => {
  it("항목마다 색이 정해져 있어 목록 순서가 바뀌어도 같은 색이다", () => {
    const before = [{ id: 10 }, { id: 20 }, { id: 30 }];
    const after = [{ id: 30 }, { id: 10 }, { id: 20 }]; // 위아래로 옮긴 뒤
    for (const id of [10, 20, 30]) expect(stageColorIndex(after, id)).toBe(stageColorIndex(before, id));
  });

  it("만든 순서대로 색을 돌려 쓴다", () => {
    const n = PROGRESS_ROW_STYLES.length;
    const stages = Array.from({ length: n + 1 }, (_, i) => ({ id: i + 1 }));
    expect(stageColorIndex(stages, 1)).toBe(0);
    expect(stageColorIndex(stages, n + 1)).toBe(0);
  });
});
