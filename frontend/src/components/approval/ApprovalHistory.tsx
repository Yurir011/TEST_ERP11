import { ChevronRight } from "lucide-react";
import { buildHistory, type HistoryInput, type LineState, type NowKind } from "./historyModel";

const LINE_LABEL: Record<LineState, string> = { ok: "승인", cur: "결재 중", bad: "반려", idle: "대기" };
const LINE_DOT: Record<LineState, string> = { ok: "bg-[#34c6dc]", cur: "bg-[#e07bf0]", bad: "bg-[#fb7f9a]", idle: "bg-[#dde6f0]" };
const LINE_TEXT: Record<LineState, string> = { ok: "text-[#0b7f93]", cur: "text-[#a43ec2]", bad: "text-[#c4294f]", idle: "text-text-muted" };
const NOW_PILL: Record<NowKind, string> = { draft: "bg-[#9aa8bd]", pending: "bg-[#e07bf0]", approved: "bg-[#34c6dc]", rejected: "bg-[#fb7f9a]" };
// 세 칸: 작성(하늘) · 결재/승인(연보라) · 현재 진행(연청록). 반려되면 세 번째 칸만 연한 빨강으로 바뀐다.
const CARD = "min-w-0 rounded-2xl p-4";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[42px_1fr] gap-1.5 text-[13px] mt-2 items-baseline">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Arrow() {
  return (
    <div aria-hidden="true" className="flex items-center justify-center text-text-muted/70 max-lg:rotate-90 max-lg:py-1.5">
      <ChevronRight size={20} strokeWidth={2.5} />
    </div>
  );
}

/**
 * 결재 히스토리: [작성 → 결재·승인 → 현재 진행] 세 칸에 날짜 · 처리자 · 내용을 같은 순서로 보여 준다.
 * 품목 문서와 품의서의 상세 창에서 함께 쓴다.
 */
export function ApprovalHistory(props: HistoryInput) {
  const h = buildHistory(props);
  const okCount = h.line.filter((l) => l.state === "ok").length;
  const nowBg = h.now.kind === "rejected" ? "bg-[#fb7f9a]/10" : "bg-[#2dd4bf]/[0.08]";
  return (
    <section aria-label="결재 히스토리" className="mb-4">
      <h3 className="text-sm font-bold mb-2">결재 히스토리</h3>
      <div className="grid gap-1 lg:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px_minmax(0,1fr)]">
        <div className={`${CARD} bg-[#38bdf8]/[0.08]`}>
          <h4 className="text-sm font-extrabold mb-3">작성</h4>
          <Row label="날짜">{h.made.at}</Row>
          <Row label="처리자"><b>{h.made.who}</b></Row>
          <Row label="내용">{h.made.say}</Row>
        </div>
        <Arrow />
        <div className={`${CARD} bg-[#d58af0]/[0.08]`}>
          <h4 className="text-sm font-extrabold mb-3">
            결재 · 승인 {h.line.length > 0 && <span className="text-xs font-semibold text-text-muted">{okCount}/{h.line.length}</span>}
          </h4>
          {h.line.length === 0 ? (
            <p className="text-[13px] text-text-muted">결재선이 없습니다.</p>
          ) : (
            <ul className="grid gap-2 text-[13px]">
              {h.line.map((l, i) => (
                <li key={`${l.role}-${i}`} className="grid grid-cols-[10px_1fr_auto] gap-2 items-center">
                  <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${LINE_DOT[l.state]}`} />
                  <span className="min-w-0">
                    <b>{l.name}</b>
                    <small className="text-[11.5px] text-text-muted ml-1">{l.role}</small>
                    {l.at && <small className="block text-[11.5px] text-text-muted">{l.at}</small>}
                  </span>
                  <b className={`text-xs ${LINE_TEXT[l.state]}`}>{LINE_LABEL[l.state]}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Arrow />
        <div className={`${CARD} ${nowBg}`}>
          <h4 className="text-sm font-extrabold mb-3">현재 진행</h4>
          <span className={`inline-block text-xs font-bold text-white rounded-full px-2.5 py-0.5 ${NOW_PILL[h.now.kind]}`}>{h.now.tag}</span>
          <Row label="날짜">{h.now.at}</Row>
          <Row label="처리자"><b>{h.now.who}</b></Row>
          <Row label="내용">{h.now.say}</Row>
        </div>
      </div>
    </section>
  );
}
