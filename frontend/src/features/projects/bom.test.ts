import { describe, expect, it } from "vitest";
import { bomCounts, bomReleasable, bomRemaining, bomState, bomStateLabel, groupBom, type BomLine } from "./bom";

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

describe("BOM 출고", () => {
  it("출고할 수 있는 줄: 등록됨 + 남은 필요 수량이 있음 + 재고가 그만큼 있음", () => {
    expect(bomReleasable(ok)).toBe(true);
    expect(bomReleasable(short)).toBe(false); // 재고 부족
    expect(bomReleasable(unreg)).toBe(false); // 자재관리에 없음
    expect(bomReleasable(line(4, { released: 10 }))).toBe(false); // 이미 모두 출고
    expect(bomReleasable(line(5, { released: 4, current_qty: 6 }))).toBe(true); // 남은 6개만 있으면 된다
  });
  it("일부 출고·출고 완료를 글자로 보여 주고 남은 수량을 센다", () => {
    expect(bomRemaining(line(6, { released: 4 }))).toBe(6);
    expect(bomStateLabel(line(6, { released: 4 }))).toBe("일부 출고");
    expect(bomStateLabel(line(7, { released: 10 }))).toBe("출고 완료");
  });
});
