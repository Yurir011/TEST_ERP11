import { describe, expect, it } from "vitest";
import { STATUS_OPTIONS, favoritesOf, filterByName, isPresenceStatus, statusDotClass, statusLabel, withFavorite, withStatus } from "./presence";
import type { DirectoryUser } from "./types";

const u = (id: number, name: string, over: Partial<DirectoryUser> = {}): DirectoryUser => ({ id, name, grade: "staff", title: null, status: "absent", is_favorite: false, ...over });

describe("상태 표시", () => {
  it("선택할 수 있는 상태는 출근·회의중·식사중·외근·출장·휴가·퇴근 순이고 미출근은 고를 수 없다", () => {
    expect(STATUS_OPTIONS.map((o) => o.label)).toEqual(["출근", "회의중", "식사중", "외근", "출장", "휴가", "퇴근"]);
    expect(STATUS_OPTIONS.map((o) => o.value)).not.toContain("absent");
  });

  it("상태 값마다 글자가 있고, 서버가 모르는 값을 보내도 글자 그대로 보여 준다", () => {
    expect(statusLabel("working")).toBe("출근");
    expect(statusLabel("absent")).toBe("미출근");
    expect(statusLabel("overtime")).toBe("overtime");
  });

  it("상태마다 점 색이 다르고, 모르는 값은 미출근과 같은 회색", () => {
    const colors = ["working", "meeting", "meal", "outside", "trip", "leave", "off", "absent"].map(statusDotClass);
    expect(new Set(colors).size).toBe(colors.length);
    expect(statusDotClass("overtime")).toBe(statusDotClass("absent"));
  });

  it("isPresenceStatus", () => {
    expect(isPresenceStatus("trip")).toBe(true);
    expect(isPresenceStatus("toString")).toBe(false); // 객체 기본 속성 이름에 속지 않는다
    expect(isPresenceStatus(3)).toBe(false);
    expect(isPresenceStatus(null)).toBe(false);
  });
});

describe("목록 계산", () => {
  const list = [u(1, "김영희", { is_favorite: true }), u(2, "이철수"), u(3, "박영수", { is_favorite: true })];

  it("이름 검색: 부분 일치, 앞뒤 공백 무시, 빈 검색어는 전부", () => {
    expect(filterByName(list, "영").map((x) => x.id)).toEqual([1, 3]);
    expect(filterByName(list, "  철수 ").map((x) => x.id)).toEqual([2]);
    expect(filterByName(list, "")).toBe(list);
    expect(filterByName(list, "없는이름")).toEqual([]);
  });

  it("즐겨찾기만 추린다 (목록이 아직 없으면 빈 목록)", () => {
    expect(favoritesOf(list).map((x) => x.id)).toEqual([1, 3]);
    expect(favoritesOf(null)).toEqual([]);
  });

  it("한 직원의 상태·즐겨찾기만 바꾼 새 목록을 만들고 원본은 그대로", () => {
    const s = withStatus(list, 2, "trip");
    expect(s.find((x) => x.id === 2)?.status).toBe("trip");
    expect(s.find((x) => x.id === 1)).toBe(list[0]); // 다른 직원은 같은 객체
    expect(list[1].status).toBe("absent");
    const f = withFavorite(list, 2, true);
    expect(favoritesOf(f).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(list[1].is_favorite).toBe(false);
  });

  it("바뀐 것이 없거나 목록에 없는 직원이면 같은 항목을 그대로 둔다", () => {
    expect(withStatus(list, 1, "absent")[0]).toBe(list[0]);
    expect(withStatus(list, 99, "trip").every((x, i) => x === list[i])).toBe(true);
    expect(withFavorite(list, 1, true)[0]).toBe(list[0]);
  });
});
