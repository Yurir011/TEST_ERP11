import { describe, expect, it } from "vitest";
import { formatNoteDate, groupNotesByDate, monthCells, formatNoteDateTime, offsetFromStart, repliesByParent, type ProjectDateNote } from "./dateNotes";

const note = (id: number, note_date: string, parent_id: number | null = null): ProjectDateNote => ({ id, parent_id, note_date, content: `메모${id}`, author_name: null, created_by: null, created_at: "2026-10-20T00:00:00Z" });

describe("날짜별 메모 도우미", () => {
  it("같은 날짜끼리 묶고 최근 날짜가 먼저, 같은 날은 받은 순서를 지킨다", () => {
    const groups = groupNotesByDate([note(1, "2026-10-08"), note(2, "2026-10-20"), note(3, "2026-10-20")]);
    expect(groups.map((g) => g.date)).toEqual(["2026-10-20", "2026-10-08"]);
    expect(groups[0].notes.map((n) => n.id)).toEqual([2, 3]);
  });

  it("답글은 날짜 묶음에 따로 나오지 않고 원 메모별로 모인다", () => {
    const list = [note(1, "2026-10-08"), note(2, "2026-10-08", 1), note(3, "2026-10-08", 1), note(4, "2026-10-09")];
    expect(groupNotesByDate(list).flatMap((g) => g.notes.map((n) => n.id))).toEqual([4, 1]);
    expect(repliesByParent(list).get(1)?.map((n) => n.id)).toEqual([2, 3]);
    expect(repliesByParent(list).get(4)).toBeUndefined();
  });

  it("답글 시각은 날짜와 시간을 함께 보여 준다", () => {
    expect(formatNoteDateTime("2026-10-21T09:31:00")).toBe("10/21 09:31");
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
