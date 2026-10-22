import { buildHistory, type HistoryInput, type LineState } from "./historyModel";

const RING: Record<LineState, string> = {
  ok: "border-success text-success",
  cur: "border-primary text-primary",
  bad: "border-danger text-danger",
  idle: "border-border text-text-muted",
};
const LABEL: Record<LineState, string> = { ok: "승인", cur: "결재 중", bad: "반려", idle: "대기" };

/** "2026-10-22 16:40" → "10-22" (처리하지 않았으면 빈 글) */
const shortDate = (at: string) => (at.length >= 10 ? at.slice(5, 10) : "");

function Stamp({ ring, label, name, role, date }: { ring: string; label: string; name: string; role?: string; date?: string }) {
  return (
    <li className="w-[68px] text-center text-[11px] leading-tight text-text-muted">
      <span className={`mx-auto mb-1 grid h-10 w-10 place-items-center rounded-full border-2 text-xs font-extrabold ${ring}`}>{label}</span>
      <b className="block text-[12px] font-semibold text-text break-words">{name}</b>
      {role && <span className="block break-words">{role}</span>}
      {date && <span className="block tabular-nums">{date}</span>}
    </li>
  );
}

/**
 * 결재 도장 줄: [작성] 과 결재자마다 동그란 도장 하나. 승인은 초록, 지금 차례는 파랑, 반려는 빨강, 아직은 회색 테두리.
 * 이름 아래에 직책(전결 포함)과 처리한 날짜(월-일)를 적는다. 상세 창 머리 오른쪽에 둔다.
 */
export function ApprovalStamps(props: HistoryInput) {
  const h = buildHistory(props);
  return (
    <ol aria-label="결재 현황" className="flex shrink-0 gap-1.5">
      <Stamp ring="border-border text-text-muted" label="작성" name={h.made.who} date={shortDate(h.made.at)} />
      {h.line.map((l, i) => (
        <Stamp key={`${l.role}-${i}`} ring={RING[l.state]} label={LABEL[l.state]} name={l.name} role={l.role} date={shortDate(l.at)} />
      ))}
    </ol>
  );
}

/**
 * 도장 줄로는 알 수 없는 사정을 한 줄로 알린다: 결재를 기다리는 중이면 누구를 얼마나 기다리는지, 반려됐으면 사유.
 * 승인 완료·작성 중에는 아무것도 보이지 않는다.
 */
export function ApprovalNote(props: HistoryInput) {
  const h = buildHistory(props);
  if (props.deleteRequested) return null; // 삭제 결재 안내는 상세 창이 따로 보여 준다
  if (h.now.kind === "pending") {
    return (
      <p role="status" className="text-xs text-primary bg-primary/10 rounded-lg px-3 py-2">
        {h.now.who} 결재 중 · {h.now.at}
      </p>
    );
  }
  if (h.now.kind === "rejected") {
    return (
      <p role="status" className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">
        반려 · {h.now.who} — {h.now.say}
      </p>
    );
  }
  return null;
}
