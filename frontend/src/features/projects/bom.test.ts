import { describe, expect, it } from "vitest";
import { bomCounts, bomPendingRows, bomReleaseRows, bomReleaseTotals, bomState, bomStateLabel, groupBom, type BomLine } from "./bom";

const line = (id: number, over: Partial<BomLine> = {}): BomLine => ({
  id,
  material_id: id,
  registered: true,
  code: `EG-${id}`,
  item_name: `자재${id}`,
  category_label: "회로부품",
  sub_levels: [],
  quantity: 10,
  note: null,
  current_qty: 100,
  shortage: null,
  released: 0,
  pending_units: 0,
  ...over,
});

const ok = line(1);
const short = line(2, { current_qty: 4, shortage: 6 });
const unreg = line(3, { material_id: null, registered: false, code: null, current_qty: null });

describe("BOM 상태", () => {
  it("재고 부족·미등록·충분을 가르고 글자를 만든다", () => {
    expect([ok, short, unreg].map(bomState)).toEqual(["good", "bad", "warn"]);
    expect([ok, short, unreg].map(bomStateLabel)).toEqual(["충분", "6개 부족", "미등록"]);
  });

  it("칩에 보일 개수를 센다", () => {
    expect(bomCounts([ok, short, unreg, line(4)])).toEqual({ all: 4, bad: 1, warn: 1, good: 2 });
  });

  it("조치 필요(부족·미등록)를 위로 모으고, 칩으로 거른다", () => {
    const all = [ok, short, unreg, line(4)];
    const g = groupBom(all, "all");
    expect(g.need.map((l) => l.id)).toEqual([2, 3]);
    expect(g.ok.map((l) => l.id)).toEqual([1, 4]);
    expect(groupBom(all, "bad")).toEqual({ need: [short], ok: [] });
    expect(groupBom(all, "good").need).toEqual([]);
  });
});

describe("BOM 출고(제품 개수 기준)", () => {
  it("제품 개수를 곱해 필요 개수를 구하고, 재고가 모자라거나 미등록이면 이번 출고에서 뺀다", () => {
    const rows = bomReleaseRows([ok, short, unreg], 10); // ok: 재고 100, short: 재고 4, 모두 1개당 10
    expect(rows.map((r) => r.need)).toEqual([100, 100, 100]);
    expect(rows.map((r) => r.ok)).toEqual([true, false, false]);
    expect(rows.map((r) => r.held)).toEqual([false, true, false]); // 미등록은 보류하지 않는다
    expect(rows.map((r) => r.short)).toEqual([0, 96, 0]);
  });
  it("재고가 정확히 필요한 개수면 출고하고, 한 개라도 모자라면 뺀다", () => {
    expect(bomReleaseRows([ok], 10)[0].ok).toBe(true); // 100 / 100
    expect(bomReleaseRows([ok], 11)[0].ok).toBe(false); // 100 / 110
  });
  it("합계는 이번에 출고하는 줄만 센다", () => {
    expect(bomReleaseTotals(bomReleaseRows([ok, short, unreg], 5))).toEqual({ kinds: 1, qty: 50, held: 1 }); // short: 재고 4 < 50
  });
  it("보류분은 보류된 제품 개수 × 1개당으로 필요한 개수를 구하고 재고가 되면 출고 가능", () => {
    const held = line(5, { pending_units: 3, current_qty: 29 }); // 1개당 10 → 30 필요
    const ready = line(6, { pending_units: 3, current_qty: 30 });
    const rows = bomPendingRows([ok, held, ready, unreg]);
    expect(rows.map((r) => [r.line.id, r.need, r.ready, r.short])).toEqual([[5, 30, false, 1], [6, 30, true, 0]]);
  });
});
