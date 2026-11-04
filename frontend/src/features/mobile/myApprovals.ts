import { canWithdrawApproval } from "../../components/approval/withdraw";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { DOC_TYPE_LABELS, type DocumentRecord } from "../documents/types";
import type { LeaveRecord } from "../leaves/types";
import { PROJECT_DOC_TYPE_LABELS, type ProjectDocument } from "../projectDocuments/types";
import type { Proposal } from "../proposals/types";
import type { ApprovalKind } from "./approvalQueue";

export type MyApprovalStatus = "pending" | "approved" | "rejected" | "withdrawn" | "draft";

/** 내가 올린 결재 문서를 종류와 상관없이 같은 모양으로 다루기 위한 항목. */
export interface MyApprovalItem {
  key: string;
  kind: ApprovalKind;
  id: number;
  kindLabel: string;
  title: string;
  date: string;
  status: MyApprovalStatus;
  /** 승인 전이고 다른 결재자가 아직 아무도 승인하지 않아 회수할 수 있는가 */
  canWithdraw: boolean;
  /** 회수한 문서·작성 중 문서는 폰에서 폐기(삭제)할 수 있다 */
  canDiscard: boolean;
  /** 상태 아래에 보여 줄 한 줄 설명 */
  note: string;
  /** 회수·삭제 API의 기본 경로 (예: /api/leaves/3) */
  basePath: string;
}

interface StepLike {
  step_order: number;
  title: string;
  approver_id: number;
  approver_name: string;
  status: "pending" | "approved" | "rejected";
}

const TITLE_LABELS: Record<string, string> = { dept_head: "부서장", team_lead: "팀장", ceo: "대표" };
const LIST_LIMIT = 30;

/** "팀장 홍길동 결재 대기" 처럼 지금 누구를 기다리는지 말해 준다. */
export function waitingNote(steps: StepLike[], currentStep: number): string {
  const cur = steps.find((s) => s.step_order === currentStep);
  if (!cur) return "결재 대기";
  const approved = steps.filter((s) => s.status === "approved").length;
  const progress = steps.length > 1 ? ` (${approved}/${steps.length}단계 승인)` : "";
  return `${TITLE_LABELS[cur.title] ?? cur.title} ${cur.approver_name} 결재 대기${progress}`;
}

function noteFor(status: MyApprovalStatus, steps: StepLike[], currentStep: number, rejectReason: string | null, deleteRequested = false): string {
  switch (status) {
    case "pending":
      return `${deleteRequested ? "삭제 결재 중 · " : ""}${waitingNote(steps, currentStep)}`;
    case "approved":
      return "승인 완료";
    case "rejected":
      return rejectReason ? `반려: ${rejectReason}` : "반려됨";
    case "withdrawn":
      return "회수함 · 수정해서 다시 올리기는 PC에서";
    case "draft":
      return "작성 중 · 수정해서 다시 올리기는 PC에서";
  }
}

export interface MyApprovalSources {
  leaves: LeaveRecord[];
  docs: DocumentRecord[];
  projectDocs: ProjectDocument[];
  proposals: Proposal[];
}

/** 4종류의 목록을 한 줄 목록으로 합쳐 최신순으로 정리한다 (연차·증명서는 이미 내 것, 문서·품의서는 내가 쓴 것만). */
export function buildMyApprovalItems(userId: number, src: MyApprovalSources): MyApprovalItem[] {
  const can = (status: string, creatorId: number, steps: StepLike[]) =>
    canWithdrawApproval({ status, creatorId, userId, steps });

  const items: (MyApprovalItem & { sortKey: string })[] = [
    ...src.leaves.map((l) => ({
      key: `leave-${l.id}`, kind: "leave" as const, id: l.id, kindLabel: "연차",
      title: `${l.start_date} ~ ${l.end_date} (${l.days}일)`, date: l.created_at, status: l.status as MyApprovalStatus,
      canWithdraw: can(l.status, l.user_id, l.steps), canDiscard: l.status === "withdrawn",
      note: noteFor(l.status, l.steps, l.current_step, l.reject_reason), basePath: `/api/leaves/${l.id}`, sortKey: l.created_at,
    })),
    ...src.docs.map((d) => ({
      key: `document-${d.id}`, kind: "document" as const, id: d.id, kindLabel: "증빙서류",
      title: `${DOC_TYPE_LABELS[d.doc_type]}${d.purpose ? ` · ${d.purpose}` : ""}`, date: d.issued_at, status: d.status as MyApprovalStatus,
      canWithdraw: can(d.status, d.user_id, d.steps), canDiscard: d.status === "withdrawn",
      note: noteFor(d.status, d.steps, d.current_step, d.reject_reason), basePath: `/api/documents/${d.id}`, sortKey: d.issued_at,
    })),
    ...src.projectDocs
      .filter((d) => d.created_by === userId)
      .map((d) => ({
        key: `project-${d.id}`, kind: "project" as const, id: d.id, kindLabel: PROJECT_DOC_TYPE_LABELS[d.doc_type],
        title: `${d.project_name} · ${d.client_name}`, date: d.created_at, status: d.status as MyApprovalStatus,
        canWithdraw: can(d.status, d.created_by, d.steps), canDiscard: d.status === "draft" && !d.delete_requested,
        note: noteFor(d.status, d.steps, d.current_step, d.reject_reason, d.delete_requested), basePath: `/api/project-documents/${d.id}`, sortKey: d.created_at,
      })),
    ...src.proposals
      .filter((p) => p.created_by === userId)
      .map((p) => ({
        key: `proposal-${p.id}`, kind: "proposal" as const, id: p.id, kindLabel: p.kind ? `품의서(${p.kind})` : "품의서",
        title: p.title, date: p.created_at, status: p.status as MyApprovalStatus,
        canWithdraw: can(p.status, p.created_by, p.steps), canDiscard: p.status === "withdrawn",
        note: noteFor(p.status, p.steps, p.current_step, p.reject_reason, p.delete_requested), basePath: `/api/proposals/${p.id}`, sortKey: p.created_at,
      })),
  ];
  return items
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .slice(0, LIST_LIMIT)
    .map(({ sortKey: _sortKey, ...item }) => item);
}

async function safeGet<T>(path: string): Promise<T[]> {
  try {
    return await apiGet<T[]>(path);
  } catch (err) {
    logError("MobileApproval", `조회 실패: ${path}`, err);
    return [];
  }
}

export async function loadMyApprovals(userId: number): Promise<MyApprovalItem[]> {
  logDebug("MobileApproval", `내가 올린 문서 조회: user_id=${userId}`);
  const [leaves, docs, projectDocs, proposals] = await Promise.all([
    safeGet<LeaveRecord>("/api/leaves/me"),
    safeGet<DocumentRecord>("/api/documents/me"),
    safeGet<ProjectDocument>("/api/project-documents"),
    safeGet<Proposal>("/api/proposals"),
  ]);
  const items = buildMyApprovalItems(userId, { leaves, docs, projectDocs, proposals });
  logDebug("MobileApproval", `내가 올린 문서 ${items.length}건`);
  return items;
}

/** 내가 승인·반려한 결재 한 건 (서버 /api/approvals/history). */
export interface ApprovalHistoryItem {
  kind: ApprovalKind;
  id: number;
  kind_label: string;
  title: string;
  subtitle: string;
  result: "approved" | "rejected";
  decided_at: string;
  doc_status: string;
}

export function loadApprovalHistory(): Promise<ApprovalHistoryItem[]> {
  logDebug("MobileApproval", "처리 내역 조회");
  return apiGet<ApprovalHistoryItem[]>("/api/approvals/history");
}
