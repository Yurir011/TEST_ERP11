import { describe, expect, it } from "vitest";
import { buildHistory, elapsedText, formatHistoryTime, type HistoryInput, type HistoryStep } from "./historyModel";

const step = (order: number, title: string, name: string, status: HistoryStep["status"], at: string | null): HistoryStep => ({
  step_order: order,
  title,
  approver_name: name,
  status,
  decided_at: at,
});
const base: HistoryInput = {
  creatorName: "김영업",
  createdAt: "2026-10-19T09:12:00",
  summary: "견적 외 2건 · 합계 100원",
  steps: [step(1, "dept_head", "박부장", "approved", "2026-10-19T10:05:00"), step(2, "team_lead", "이팀장", "pending", null), step(3, "ceo", "최대표", "pending", null)],
  currentStep: 2,
  status: "pending",
  finalDecision: false,
  rejectReason: null,
  deleteRequested: false,
};

describe("결재 히스토리 정리", () => {
  it("진행 중: 작성 정보, 결재선 상태, 지금 차례의 대기 시간이 나온다", () => {
    const h = buildHistory(base, new Date("2026-10-19T12:20:00"));
    expect(h.made).toEqual({ at: "2026-10-19 09:12", who: "김영업", say: "견적 외 2건 · 합계 100원" });
    expect(h.line.map((l) => [l.role, l.state, l.at])).toEqual([
      ["부서장", "ok", "2026-10-19 10:05"],
      ["팀장", "cur", ""],
      ["대표", "idle", ""],
    ]);
    expect(h.now).toMatchObject({ kind: "pending", tag: "결재 대기", who: "이팀장 팀장" });
    expect(h.now.at).toBe("2026-10-19 10:05부터 대기 중 (2시간 15분)");
  });

  it("첫 단계 대기는 작성 시각부터 센다", () => {
    const h = buildHistory({ ...base, steps: [step(1, "dept_head", "박부장", "pending", null)], currentStep: 1 }, new Date("2026-10-19T09:42:00"));
    expect(h.now.at).toBe("2026-10-19 09:12부터 대기 중 (30분)");
  });

  it("반려: 반려한 사람과 사유가 나오고 이후 단계는 대기로 남는다", () => {
    const steps = [step(1, "dept_head", "박부장", "approved", "2026-10-19T10:05:00"), step(2, "team_lead", "이팀장", "rejected", "2026-10-19T13:15:00"), step(3, "ceo", "최대표", "pending", null)];
    const h = buildHistory({ ...base, steps, currentStep: 2, status: "rejected", rejectReason: "수량이 다릅니다." });
    expect(h.line.map((l) => l.state)).toEqual(["ok", "bad", "idle"]);
    expect(h.now).toEqual({ kind: "rejected", tag: "반려됨", at: "2026-10-19 13:15", who: "이팀장 팀장", say: "수량이 다릅니다." });
  });

  it("반려 사유가 비어 있으면 안내 문구를 쓴다", () => {
    const steps = [step(1, "dept_head", "박부장", "rejected", "2026-10-19T10:05:00")];
    expect(buildHistory({ ...base, steps, currentStep: 1, status: "rejected", rejectReason: "  " }).now.say).toBe("반려 사유가 적혀 있지 않습니다.");
  });

  it("승인 완료: 마지막 승인자와 시각이 나온다", () => {
    const steps = [step(1, "dept_head", "박부장", "approved", "2026-10-17T15:02:00"), step(2, "ceo", "최대표", "approved", "2026-10-18T09:31:00")];
    const h = buildHistory({ ...base, steps, currentStep: 2, status: "approved" });
    expect(h.line.map((l) => l.state)).toEqual(["ok", "ok"]);
    expect(h.now).toMatchObject({ kind: "approved", tag: "승인됨", at: "2026-10-18 09:31", who: "최대표 대표" });
  });

  it("전결: 결재선이 없어도 전결 한 줄과 승인 상태가 나온다", () => {
    const h = buildHistory({ ...base, steps: [], currentStep: 0, status: "approved", finalDecision: true, decidedAt: "2026-10-19T09:13:00" });
    expect(h.line).toEqual([{ role: "전결", name: "김영업", state: "ok", at: "2026-10-19 09:13" }]);
    expect(h.now).toMatchObject({ kind: "approved", who: "김영업 (전결)", at: "2026-10-19 09:13" });
  });

  it("삭제 결재 중이면 지금 칸에 그렇게 표시한다", () => {
    const h = buildHistory({ ...base, deleteRequested: true }, new Date("2026-10-19T12:20:00"));
    expect(h.now).toMatchObject({ kind: "pending", tag: "삭제 결재 중" });
  });

  it("작성 중(임시저장)은 결재 전이라고 알린다", () => {
    const h = buildHistory({ ...base, steps: [], currentStep: 0, status: "draft" });
    expect(h.now).toMatchObject({ kind: "draft", tag: "작성 중" });
  });
});

describe("시각 표시", () => {
  it("읽을 수 없는 값은 -", () => {
    expect(formatHistoryTime(null)).toBe("-");
    expect(formatHistoryTime("엉터리")).toBe("-");
  });
  it("걸린 시간을 분·시간·일로 말한다", () => {
    const now = new Date("2026-10-20T12:00:00");
    expect(elapsedText("2026-10-20T11:59:30", now)).toBe("방금");
    expect(elapsedText("2026-10-20T11:15:00", now)).toBe("45분");
    expect(elapsedText("2026-10-20T10:00:00", now)).toBe("2시간");
    expect(elapsedText("2026-10-18T09:00:00", now)).toBe("2일 3시간");
  });
});
