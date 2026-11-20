import { useNavigate } from "react-router-dom";
import { todayISO } from "../../lib/date";
import type { ProgressStage, PurchaseStep } from "./types";

export interface ProgressOverviewItem {
  id: number;
  name: string;
  client_name: string;
  start_date: string | null;
  end_date: string | null;
  progress_percent: number;
  stages: ProgressStage[];
  purchase_steps: PurchaseStep[];
}

type Tone = "danger" | "amber" | "blue";

// 화면 테마와 상관없는 고정 색(신뢰감 있는 블루·네이비 계열). 지연=크림슨, 마감 7일 이내=앰버, 그 외=블루.
const TONE_COLOR: Record<Tone, string> = {
  danger: "#c93636",
  amber: "#d08a12",
  blue: "#2a62d6",
};
const PURCHASE_DONE = "#2f9e6e";
const mixSurface = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, var(--color-surface))`;
/** 끝낸 단계의 색: 스틸 네이비. 흰 글씨 대비 4.9:1, 어두운 테마의 카드 위에서도 3:1 이상 */
const DONE_COLOR = "#4a6fb8";
const DONE_TEXT = "#ffffff";

/** 단계 하나의 색: 끝낸 단계는 잉크색, 지금 단계는 상태색, 나머지는 옅은 상태색 */
function stageFill(done: boolean, current: boolean, tone: string): string {
  if (done) return DONE_COLOR;
  return current ? mixSurface(tone, 52) : mixSurface(tone, 14);
}

const RING_SIZE = 112;
const RING_STROKE = 10;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_LEN = 2 * Math.PI * RING_R;

function dayDiff(toISO: string, fromISO: string): number {
  return Math.round((new Date(`${toISO}T00:00:00`).getTime() - new Date(`${fromISO}T00:00:00`).getTime()) / 86400000);
}

/** 마감까지 남은 일수로 색과 문구를 정한다 (지연=빨강, 7일 이내=주황, 그 외=파랑). */
function dueInfo(endDate: string | null, today: string): { tone: Tone; label: string } {
  if (!endDate) return { tone: "blue", label: "일정 미정" };
  const d = dayDiff(endDate, today);
  if (d < 0) return { tone: "danger", label: `${-d}일 지연` };
  if (d === 0) return { tone: "amber", label: "오늘 마감" };
  return { tone: d <= 7 ? "amber" : "blue", label: `D-${d}` };
}

function shortDate(iso: string): string {
  return iso.slice(5).replace("-", "/");
}

/** 원그래프: 단계마다 호 하나(그 단계 진행률 ÷ 단계 수). 끝낸 단계는 잉크색, 지금 단계는 상태색이라 막대와 색이 대응된다. */
function Ring({ percent, tone, stages }: { percent: number; tone: string; stages: ProgressStage[] }) {
  const n = stages.length;
  const currentIdx = stages.findIndex((s) => s.progress_percent < 100);
  let offset = 0;
  const arcs =
    n === 0
      ? [{ key: "all", len: (RING_LEN * percent) / 100, off: 0, color: tone, cap: "round" as const }]
      : stages
          .filter((s) => s.progress_percent > 0)
          .map((s) => {
            const idx = stages.indexOf(s);
            const len = (RING_LEN * (s.progress_percent / n)) / 100;
            const arc = { key: String(s.id), len, off: offset, color: stageFill(s.progress_percent === 100, idx === currentIdx, tone), cap: "butt" as const };
            offset += len;
            return arc;
          });
  const gap = arcs.length > 1 ? 2 : 0;
  return (
    <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }} role="img" aria-label={`진행률 ${percent}%`}>
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke="var(--color-border)" strokeWidth={RING_STROKE} />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_R}
            fill="none"
            style={{ stroke: a.color }}
            strokeWidth={RING_STROKE}
            strokeLinecap={a.cap}
            strokeDasharray={`${Math.max(0, a.len - gap)} ${RING_LEN}`}
            strokeDashoffset={-a.off}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <b className="text-[28px] font-bold tracking-tight">
          {percent}
          <span className="text-sm font-semibold">%</span>
        </b>
        <small className="mt-1 text-[10.5px] text-text-muted">진행률</small>
      </div>
    </div>
  );
}

const NOTCH = 13; // 화살표 끝의 뾰족한 부분 폭(px)
const OVERLAP = 8; // 이웃 칸과 겹치는 폭(px)

/** 진행 단계를 화살표(쉐브론) 모양 칸으로 이어 보여 준다. 칸 안의 색 채움이 단계 진행률이다. 끝낸 단계는 잉크색으로 물러나고 지금 단계만 상태색으로 강조하며 이름도 굵게 표시한다. */
function StageChevrons({ stages, color }: { stages: ProgressStage[]; color: string }) {
  const currentIdx = stages.findIndex((s) => s.progress_percent < 100);
  return (
    <div className="flex">
      {stages.map((s, i) => {
        const done = s.progress_percent === 100;
        const fill = stageFill(done, i === currentIdx, color);
        const w = `${s.progress_percent}%`;
        const first = i === 0;
        return (
          <div key={s.id} className="min-w-0 flex-1" style={{ marginLeft: first ? 0 : -OVERLAP }}>
            <div
              className="flex h-[42px] items-center justify-center text-[12.5px] font-bold tabular-nums"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={s.progress_percent}
              aria-label={`${s.name} 진행률`}
              style={{
                color: done ? DONE_TEXT : undefined,
                background: `linear-gradient(90deg, ${fill} ${w}, var(--color-border) ${w})`,
                clipPath: first
                  ? `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`
                  : `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`,
              }}
            >
              {s.progress_percent}%
            </div>
            <div className={`mt-1.5 truncate text-center text-xs ${i === currentIdx ? "font-bold text-text" : "text-text-muted"}`} title={s.name}>
              {s.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PurchaseDots({ steps }: { steps: PurchaseStep[] }) {
  if (steps.length === 0) return null;
  const doneCount = steps.filter((s) => s.is_done).length;
  const lastDone = [...steps].reverse().find((s) => s.is_done);
  return (
    <div className="flex items-center gap-2 border-t border-dashed border-border pt-3 text-[11.5px] text-text-muted">
      <em className="mr-1 font-semibold not-italic">구매</em>
      {steps.map((s, i) => (
        <span key={s.id} className="flex items-center gap-2">
          {i > 0 && <span className="h-0.5 w-3.5 bg-border" style={s.is_done ? { background: PURCHASE_DONE } : undefined} />}
          <span title={s.label} className="h-[9px] w-[9px] rounded-full bg-border" style={s.is_done ? { background: PURCHASE_DONE } : undefined} />
        </span>
      ))}
      <span>{doneCount === 0 ? "대기" : `${lastDone?.label} 완료`}</span>
    </div>
  );
}

export function ProjectProgressSets({ items }: { items: ProgressOverviewItem[] }) {
  const navigate = useNavigate();
  const today = todayISO();

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
        <p className="text-sm text-text-muted">진행 중인 프로젝트가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((p) => {
        const due = dueInfo(p.end_date, today);
        const color = TONE_COLOR[due.tone];
        return (
          <div
            key={p.id}
            onClick={() => navigate(`/projects/${p.id}`)}
            className="grid cursor-pointer grid-cols-[280px_1fr] overflow-hidden rounded-2xl border border-border bg-surface transition-shadow hover:shadow-md"
          >
            <div className="flex flex-col items-center justify-center gap-4 border-r border-border px-8 py-[22px]">
              <Ring percent={p.progress_percent} tone={color} stages={p.stages} />
              <dl className="grid w-full grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 text-xs">
                <dt className="text-text-muted">거래처</dt>
                <dd className="truncate text-right font-semibold" title={p.client_name}>
                  {p.client_name}
                </dd>
                <dt className="text-text-muted">일정</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {p.start_date && p.end_date ? `${shortDate(p.start_date)} ~ ${shortDate(p.end_date)}` : "-"}
                </dd>
                <dt className="text-text-muted">마감</dt>
                <dd className="text-right font-semibold tabular-nums">{p.end_date ? shortDate(p.end_date) : "-"}</dd>
              </dl>
            </div>

            <div className="flex min-w-0 max-w-[710px] flex-col gap-3.5 px-[28px] py-[22px]">
              <div className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.name}</span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ color: `color-mix(in srgb, ${color} 72%, var(--color-text))`, background: mixSurface(color, 15) }}
                >
                  {due.label}
                </span>
              </div>

              {p.stages.length === 0 ? (
                <p className="py-3 text-xs text-text-muted">등록된 진행 단계가 없습니다. 프로젝트를 열어 진행 단계를 추가하세요.</p>
              ) : (
                <StageChevrons stages={p.stages} color={color} />
              )}

              <PurchaseDots steps={p.purchase_steps} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
