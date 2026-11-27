import { describe, expect, it } from "vitest";
import { deliveryLabel, deliveryState, isDeliveryStage } from "./DeliveryDialog";
import type { DeliveryList } from "./types";

const rec = (id: number, on: string, quantity: number) => ({ id, project_id: 1, delivered_on: on, quantity, memo: null, created_at: "2026-11-27T00:00:00Z" });
const list = (items: ReturnType<typeof rec>[]): DeliveryList => ({
  items,
  total_count: items.length,
  total_quantity: items.reduce((s, d) => s + d.quantity, 0),
});

describe("납품 항목 표시", () => {
  it("이름이 정확히 납품인 항목만 납품 항목이다", () => {
    expect(isDeliveryStage({ name: "납품" })).toBe(true);
    expect(isDeliveryStage({ name: " 납품 " })).toBe(true);
    expect(isDeliveryStage({ name: "납품 준비" })).toBe(false);
    expect(isDeliveryStage({ name: "생산" })).toBe(false);
  });

  it("상태: 기록 없음=미완료, 기록 있고 완료 전=납품 중, 100%=완료", () => {
    expect(deliveryState({ progress_percent: 0 }, list([]))).toBe("none");
    expect(deliveryState({ progress_percent: 0 }, null)).toBe("none");
    expect(deliveryState({ progress_percent: 0 }, list([rec(1, "2026-11-20", 100)]))).toBe("partial");
    expect(deliveryState({ progress_percent: 100 }, list([rec(1, "2026-11-20", 100)]))).toBe("done");
  });

  it("바 옆 글: 완료는 날짜·개수, 분할 완료는 횟수까지, 납품 중은 누적", () => {
    expect(deliveryLabel("none", list([]))).toBeNull();
    expect(deliveryLabel("done", list([rec(1, "2026-11-30", 250)]))).toBe("11/30 · 250개");
    expect(deliveryLabel("done", list([rec(1, "2026-11-20", 100), rec(2, "2026-11-30", 150)]))).toBe("11/30 · 2회 250개");
    expect(deliveryLabel("partial", list([rec(1, "2026-11-20", 100)]))).toBe("누적 1회 · 100개");
  });
});
