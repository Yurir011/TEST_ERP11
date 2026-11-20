import { describe, expect, it } from "vitest";
import { HELP_CATEGORIES, HELP_TOPICS } from "./helpContent";
import { filterTopics } from "./helpSearch";

describe("도움말 내용", () => {
  it("주제 id 는 겹치지 않고, 모든 분류에 주제가 있다", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of HELP_CATEGORIES) {
      expect(HELP_TOPICS.some((t) => t.category === c.id)).toBe(true);
    }
  });

  it("주제의 분류는 모두 정의된 분류다", () => {
    const known = new Set(HELP_CATEGORIES.map((c) => c.id));
    for (const t of HELP_TOPICS) expect(known.has(t.category)).toBe(true);
  });
});

describe("filterTopics", () => {
  it("검색어가 없으면 분류만 걸러 원래 순서를 지킨다", () => {
    expect(filterTopics(HELP_TOPICS, "", null)).toHaveLength(HELP_TOPICS.length);
    const approval = filterTopics(HELP_TOPICS, "  ", "approval");
    expect(approval.length).toBeGreaterThan(0);
    expect(approval.every((t) => t.category === "approval")).toBe(true);
  });

  it("오류 문구로도 찾는다", () => {
    const r = filterTopics(HELP_TOPICS, "여러 번 실패해", null);
    expect(r.map((t) => t.id)).toContain("account-login");
  });

  it("검색어가 여러 개면 모두 들어 있어야 하고, 제목에 걸린 주제가 앞에 온다", () => {
    const r = filterTopics(HELP_TOPICS, "연차 신청", null);
    expect(r[0].id).toBe("att-leave-apply");
    expect(filterTopics(HELP_TOPICS, "연차 zzzz없는말", null)).toHaveLength(0);
  });

  it("대소문자를 가리지 않는다", () => {
    expect(filterTopics(HELP_TOPICS, "bom", null).length).toBeGreaterThan(0);
  });
});
