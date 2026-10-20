import { describe, expect, it } from "vitest";
import { formatNoteDate, groupNotesByDate, monthCells, offsetFromStart, type ProjectDateNote } from "./dateNotes";

const note = (id: number, note_date: string): ProjectDateNote => ({ id, note_date, content: `메모${id}`, author_name: null, created_by: null, created_at: "2026-10-20T00:00:00Z" });

describe("날짜별 메모 도우미", () => {
  it("같은 날짜끼리 묶고 최근 날짜가 먼저, 같은 날은 받은 순서를 지킨다", () => {
    const groups = groupNotesByDate([note(1, "2026-10-08"), note(2, "2026-10-20"), note(3, "2026-10-20")]);
    expect(groups.map((g) => g.date)).toEqual(["2026-10-20", "2026-10-08"]);
    expect(groups[0].notes.map((n) => n.id)).toEqual([2, 3]);
  });

  it("날짜 표기와 착수 기준 일수", () => {
    expect(formatNoteDate("2026-10-20")).toBe("10월 20일 (화)");
    expect(offsetFromStart("2026-10-20", "2026-10-05")).toBe("+15일");
    expect(offsetFromStart("2026-10-01", "2026-10-05")).toBe("착수 전");
    expect(offsetFromStart("2026-10-20", null)).toBeNull();
  });

  it("달력 칸은 일요일 시작으로 주 단위를 채운다", () => {
    const cells = monthCells(2026, 9); // 2026년 10월: 1일이 목요일
    expect(cells.length % 7).toBe(0);
    expect(cells[0].date).toBe("2026-09-27");
    expect(cells.find((c) => c.date === "2026-10-01")?.inMonth).toBe(true);
    expect(cells[0].inMonth).toBe(false);
  });
});
