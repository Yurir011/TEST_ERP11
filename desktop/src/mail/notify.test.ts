import { describe, expect, it } from "vitest";

import { formatNewMailNotice } from "./notify";

const m = (id: number, from: string, subject: string) => ({ id, from, subject });

describe("새 메일 알림 문구", () => {
  it("새 메일이 없으면 알림이 없다", () => {
    expect(formatNewMailNotice([])).toBeNull();
  });

  it("한 통이면 보낸 사람을 제목으로, 메일 제목을 내용으로", () => {
    expect(formatNewMailNotice([m(1, "김영업", "견적서 송부")])).toEqual({ title: "김영업", body: "견적서 송부" });
  });

  it("여러 통이면 개수와 앞의 세 통, 나머지는 '외 N통'", () => {
    const n = formatNewMailNotice([m(1, "가", "첫째"), m(2, "나", "둘째"), m(3, "다", "셋째"), m(4, "라", "넷째"), m(5, "마", "다섯째")]);
    expect(n?.title).toBe("새 메일 5통");
    expect(n?.body.split("\n")).toEqual(["가: 첫째", "나: 둘째", "다: 셋째", "외 2통"]);
  });

  it("세 통 이하면 '외'가 붙지 않는다", () => {
    const n = formatNewMailNotice([m(1, "가", "첫째"), m(2, "나", "둘째")]);
    expect(n?.body).toBe("가: 첫째\n나: 둘째");
  });

  it("긴 제목·이름은 줄이고 줄바꿈·탭은 공백으로 바꾼다", () => {
    const n = formatNewMailNotice([m(1, "아주긴이름".repeat(30), `줄\r\n바꿈\t포함 ${"가".repeat(300)}`)]);
    expect(n!.title.length).toBeLessThanOrEqual(60);
    expect(n!.title.endsWith("…")).toBe(true);
    expect(n!.body.length).toBeLessThanOrEqual(120);
    expect(n!.body).not.toMatch(/[\r\n\t]/);
    expect(n!.body.startsWith("줄 바꿈 포함")).toBe(true);
  });

  it("보낸 사람이 비어 있어도 알림 제목이 비지 않는다", () => {
    expect(formatNewMailNotice([m(1, "   ", "제목")])?.title).toBe("새 메일");
  });
});
