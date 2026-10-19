import type { ApprovalStepStatus } from "./types";

const TITLE_LABELS: Record<string, string> = { dept_head: "부서장", team_lead: "팀장", ceo: "대표" };

export interface HistoryStep {
  step_order: number;
  title: string;
  approver_name: string;
  status: ApprovalStepStatus;
  decided_at: string | null;
}

export interface HistoryInput {
  creatorName: string;
  createdAt: string;
  /** 작성 칸의 "내용" (문서 요약) */
  summary: string;
  steps: HistoryStep[];
  currentStep: number;
  status: ApprovalStepStatus | "draft";
  finalDecision: boolean;
  rejectReason: string | null;
  deleteRequested: boolean;
  /** 결재가 끝난 시각 (전결 등 단계 기록이 없을 때 사용) */
  decidedAt?: string | null;
}

export type LineState = "ok" | "cur" | "bad" | "idle";
export type NowKind = "pending" | "approved" | "rejected" | "draft";

export interface History {
  made: { at: string; who: string; say: string };
  line: { role: string; name: string; state: LineState; at: string }[];
  now: { kind: NowKind; tag: string; at: string; who: string; say: string };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 서버가 준 시각을 "2026-10-19 09:12" 로 (브라우저 시간대). 값이 없거나 읽을 수 없으면 "-". */
export function formatHistoryTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 걸린 시간을 "2시간 15분" 처럼 줄여 말한다. */
export function elapsedText(fromIso: string, now: Date): string {
  const ms = now.getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "방금";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}시간 ${minutes % 60}분` : `${hours}시간`;
  return hours % 24 ? `${Math.floor(hours / 24)}일 ${hours % 24}시간` : `${Math.floor(hours / 24)}일`;
}

/** 결재 정보를 [작성 → 결재·승인 → 현재 진행] 세 칸에 들어갈 내용으로 정리한다. */
export function buildHistory(input: HistoryInput, now: Date = new Date()): History {
  const { steps, status } = input;
  const roleOf = (s: HistoryStep) => TITLE_LABELS[s.title] ?? s.title;
  const current = steps.find((s) => s.step_order === input.currentStep);

  const line: History["line"] = steps.map((s) => ({
    role: roleOf(s),
    name: s.approver_name,
    state: s.status === "approved" ? "ok" : s.status === "rejected" ? "bad" : s.step_order === input.currentStep && status === "pending" ? "cur" : "idle",
    at: s.decided_at ? formatHistoryTime(s.decided_at) : "",
  }));
  if (steps.length === 0 && input.finalDecision && status === "approved") {
    line.push({ role: "전결", name: input.creatorName, state: "ok", at: input.decidedAt ? formatHistoryTime(input.decidedAt) : "" });
  }

  const made = { at: formatHistoryTime(input.createdAt), who: input.creatorName, say: input.summary };

  const waiting = (): History["now"] => {
    const prev = steps.find((s) => s.step_order === input.currentStep - 1);
    const since = prev?.decided_at ?? input.createdAt;
    return {
      kind: "pending",
      tag: input.deleteRequested ? "삭제 결재 중" : "결재 대기",
      at: `${formatHistoryTime(since)}부터 대기 중 (${elapsedText(since, now)})`,
      who: current ? `${current.approver_name} ${roleOf(current)}` : "-",
      say: input.deleteRequested
        ? "삭제 결재가 진행 중입니다. 승인되면 문서가 삭제됩니다."
        : current
          ? `${roleOf(current)} 결재를 기다리고 있습니다.`
          : "결재를 기다리고 있습니다.",
    };
  };

  let nowCard: History["now"];
  if (input.deleteRequested && status !== "rejected") {
    nowCard = waiting();
  } else if (status === "rejected") {
    const rejected = steps.find((s) => s.status === "rejected");
    nowCard = {
      kind: "rejected",
      tag: "반려됨",
      at: formatHistoryTime(rejected?.decided_at ?? input.decidedAt),
      who: rejected ? `${rejected.approver_name} ${roleOf(rejected)}` : "-",
      say: input.rejectReason?.trim() || "반려 사유가 적혀 있지 않습니다.",
    };
  } else if (status === "approved") {
    const last = [...steps].reverse().find((s) => s.status === "approved");
    nowCard = {
      kind: "approved",
      tag: "승인됨",
      at: formatHistoryTime(last?.decided_at ?? input.decidedAt),
      who: last ? `${last.approver_name} ${roleOf(last)}` : input.finalDecision ? `${input.creatorName} (전결)` : "-",
      say: "결재가 모두 완료되었습니다.",
    };
  } else if (status === "draft") {
    nowCard = { kind: "draft", tag: "작성 중", at: "-", who: input.creatorName, say: "아직 결재를 올리지 않았습니다." };
  } else {
    nowCard = waiting();
  }
  return { made, line, now: nowCard };
}
