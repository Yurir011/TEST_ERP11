import { buildHistory, type HistoryInput, type LineState, type NowKind } from "./historyModel";

const STATE_TEXT: Record<LineState, string> = {
  ok: "text-success",
  cur: "text-primary",
  bad: "text-danger",
  idle: "text-text-muted",
};
const STATE_LABEL: Record<LineState, string> = { ok: "승인", cur: "결재 중", bad: "반려", idle: "대기" };
const NOW_ROW: Record<NowKind, string> = {
  approved: "bg-success/10 text-success",
  pending: "bg-primary/10 text-primary",
  rejected: "bg-danger/10 text-danger",
  draft: "bg-bg text-text-muted",
};

/** "2026-10-22 16:40" → "10-22" (처리하지 않았으면 빈 글) */
const shortDate = (at: string) => (at.length >= 10 ? at.slice(5, 10) : "");

// 항목 표와 같은 진한 테두리
const CELL = "border border-[#b4b3b9] px-1.5 py-1";

/**
 * 인쇄된 품의서처럼 오른쪽 위에 놓는 결재칸: 결재자(직책)마다 한 칸, 맨 아래에 칸을 합친 상태 줄.
 * 승인은 초록, 지금 차례는 파랑, 반려는 빨강, 아직 순서가 아니면 회색 글씨로 처리 결과를 적고 아래에 이름과 날짜(월-일)를 붙인다.
 * 작성자는 항목 표에 있으므로 넣지 않는다.
 */
export function ApprovalStampBox(props: HistoryInput) {
  const h = buildHistory(props);
  const cols = h.line.map((l, i) => ({
    key: `line-${i}`,
    head: l.role === "전결" ? "결재" : l.role,
    main: STATE_LABEL[l.state],
    mainClass: `${STATE_TEXT[l.state]} font-bold`,
    sub: [l.role === "전결" ? "전결" : l.name, shortDate(l.at)].filter(Boolean).join(" "), // 전결도 처리한 날짜를 붙인다
  }));
  // 결재선이 아직 없는 문서(작성 중)도 칸이 비지 않게 한다
  if (cols.length === 0) cols.push({ key: "none", head: "결재", main: "-", mainClass: "text-text-muted", sub: "" });
  return (
    <table aria-label="결재 현황" style={{ width: `${cols.length * 5.5}rem` }} className="shrink-0 table-fixed border-collapse text-center text-[11px]">
      <thead>
        <tr className="bg-bg text-text-muted">
          {cols.map((c) => (
            <th key={c.key} scope="col" className={`${CELL} font-semibold`}>
              {c.head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {cols.map((c) => (
            <td key={c.key} className={`${CELL} h-10 align-middle break-words`}>
              <span className={`block text-xs ${c.mainClass}`}>{c.main}</span>
              {c.sub && <span className="block text-[10px] text-text-muted">{c.sub}</span>}
            </td>
          ))}
        </tr>
        <tr>
          <td colSpan={cols.length} className={`${CELL} py-1 text-xs font-bold ${NOW_ROW[h.now.kind]}`}>
            {h.now.tag}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * 결재칸으로는 알 수 없는 사정을 한 줄로 알린다: 결재를 기다리는 중이면 누구를 얼마나 기다리는지, 반려됐으면 사유.
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
