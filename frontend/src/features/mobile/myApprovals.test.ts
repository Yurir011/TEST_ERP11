import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "../documents/types";
import type { LeaveRecord } from "../leaves/types";
import type { ProjectDocument } from "../projectDocuments/types";
import type { Proposal } from "../proposals/types";
import { buildMyApprovalItems, waitingNote, type MyApprovalSources } from "./myApprovals";

const step = (order: number, title: string, approverId: number, name: string, status: "pending" | "approved" | "rejected") => ({
  step_order: order, title, approver_id: approverId, approver_name: name, status, decided_at: null,
});

const ME = 1;

const leave = (over: Partial<LeaveRecord>): LeaveRecord =>
  ({
    id: 1, user_id: ME, user_name: "나", start_date: "2026-12-14", end_date: "2026-12-15", days: 2, reason: "휴가",
    status: "pending", current_step: 1, steps: [step(1, "dept_head", 7, "김부장", "pending")], reject_reason: null,
    created_at: "2026-11-01T09:00:00Z", ...over,
  }) as unknown as LeaveRecord;

const projectDoc = (over: Partial<ProjectDocument>): ProjectDocument =>
  ({
    id: 5, doc_type: "quotation", project_name: "안테나 개발", client_name: "한결통신", created_by: ME, status: "pending", current_step: 1,
    steps: [step(1, "dept_head", 7, "김부장", "pending")], reject_reason: null, delete_requested: false, created_at: "2026-11-03T09:00:00Z", ...over,
  }) as unknown as ProjectDocument;

const empty: MyApprovalSources = { leaves: [], docs: [], projectDocs: [], proposals: [] };

describe("waitingNote", () => {
  it("지금 기다리는 결재자와 진행 단계를 말해 준다", () => {
    const steps = [step(1, "dept_head", 7, "김부장", "approved"), step(2, "team_lead", 8, "이팀장", "pending")];
    expect(waitingNote(steps, 2)).toBe("팀장 이팀장 결재 대기 (1/2단계 승인)");
    expect(waitingNote([step(1, "ceo", 9, "박대표", "pending")], 1)).toBe("대표 박대표 결재 대기");
  });
});

describe("buildMyApprovalItems", () => {
  it("승인 전이고 다른 결재자가 아직 승인하지 않았으면 회수할 수 있다", () => {
    const [item] = buildMyApprovalItems(ME, { ...empty, leaves: [leave({})] });
    expect(item).toMatchObject({ kind: "leave", status: "pending", canWithdraw: true, canDiscard: false, basePath: "/api/leaves/1" });
    expect(item.note).toContain("김부장");
  });

  it("다른 결재자가 이미 승인했으면 회수할 수 없다", () => {
    const steps = [step(1, "dept_head", 7, "김부장", "approved"), step(2, "team_lead", 8, "이팀장", "pending")];
    const [item] = buildMyApprovalItems(ME, { ...empty, leaves: [leave({ steps, current_step: 2 } as Partial<LeaveRecord>)] });
    expect(item.canWithdraw).toBe(false);
  });

  it("회수한 연차·품의서와 작성 중 문서는 폐기할 수 있다", () => {
    const items = buildMyApprovalItems(ME, {
      ...empty,
      leaves: [leave({ status: "withdrawn", steps: [] } as Partial<LeaveRecord>)],
      projectDocs: [projectDoc({ status: "draft", steps: [] } as Partial<ProjectDocument>)],
      proposals: [{ id: 9, kind: "구매", title: "분석기", doc_no: "P-1", created_by: ME, status: "withdrawn", current_step: 1, steps: [], reject_reason: null, delete_requested: false, created_at: "2026-11-02T00:00:00Z" } as unknown as Proposal],
    });
    expect(items.map((i) => [i.kind, i.canDiscard])).toEqual([["project", true], ["proposal", true], ["leave", true]]);
    expect(items.every((i) => !i.canWithdraw)).toBe(true);
  });

  it("남이 쓴 문서·품의서는 뺀다", () => {
    const items = buildMyApprovalItems(ME, {
      ...empty,
      projectDocs: [projectDoc({ created_by: 99 })],
      proposals: [{ id: 1, created_by: 99, status: "pending", steps: [], current_step: 1, created_at: "2026-11-01T00:00:00Z" } as unknown as Proposal],
    });
    expect(items).toEqual([]);
  });

  it("최근 것이 먼저 오고 증명서도 포함한다", () => {
    const doc = { id: 3, user_id: ME, doc_type: "employment", purpose: "은행", status: "approved", current_step: 1, steps: [], reject_reason: null, issued_at: "2026-11-04T00:00:00Z" } as unknown as DocumentRecord;
    const items = buildMyApprovalItems(ME, { ...empty, leaves: [leave({})], docs: [doc], projectDocs: [projectDoc({})] });
    expect(items.map((i) => i.kind)).toEqual(["document", "project", "leave"]);
    expect(items[0].note).toBe("승인 완료");
  });
});
