import { describe, expect, it } from "vitest";
import { mergeRounds, roundPeriod } from "./rounds";
import type { Project } from "./types";

function mk(id: number, extra: Partial<Project> = {}): Project {
  return {
    id, name: "P", client_id: 1, client_name: "C", status: "estimate", memo: null, discard_reason: null,
    start_date: null, end_date: null, progress_percent: 0, creator_name: "u", created_at: "", updated_at: "",
    series_id: null, round_no: null, round_total: null, ...extra,
  };
}

describe("mergeRounds", () => {
  it("단독·지난해 프로젝트는 각각 한 줄, 올해 회차는 한 줄로 합친다", () => {
    const rows = mergeRounds([
      mk(3, { series_id: 1, round_no: 2, status: "estimate" }),
      mk(2, { series_id: 1, round_no: 1, status: "in_progress" }),
      mk(1, { series_id: 1, round_no: null }),
      mk(9),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].rounds.map((r) => r.round_no)).toEqual([1, 2]);
    expect(rows[0].project.id).toBe(2); // 진행 중인 회차
    expect(rows[1].rounds).toEqual([]);
  });

  it("진행 중인 회차가 없으면 가장 최근 회차를 연다", () => {
    const rows = mergeRounds([mk(2, { series_id: 1, round_no: 1 }), mk(3, { series_id: 1, round_no: 2 })]);
    expect(rows[0].project.id).toBe(3);
  });
});

describe("roundPeriod", () => {
  it("월/일 ~ 월/일", () => {
    expect(roundPeriod({ start_date: "2026-02-01", end_date: "2026-05-30" })).toBe("02/01 ~ 05/30");
    expect(roundPeriod({ start_date: "2026-02-01", end_date: null })).toBe("02/01 ~ ");
    expect(roundPeriod({ start_date: null, end_date: null })).toBe("");
  });
});
