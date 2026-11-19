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

const TONE_COLOR: Record<Tone, string> = {
  danger: "var(--color-danger)",
  amber: "var(--color-tile-yellow-fg)",
  blue: "var(--color-tile-blue-fg)",
};
const TONE_CHIP: Record<Tone, string> = {
  danger: "bg-danger/10 text-danger",
  amber: "bg-tile-yellow text-tile-yellow-fg",
  blue: "bg-tile-blue text-tile-blue-fg",
};

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

function Ring({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }} role="img" aria-label={`진행률 ${percent}%`}>
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke="var(--color-border)" strokeWidth={RING_STROKE} />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_LEN}
          strokeDashoffset={RING_LEN * (1 - percent / 100)}
        />
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

function PurchaseDots({ steps }: { steps: PurchaseStep[] }) {
  if (steps.length === 0) return null;
  const doneCount = steps.filter((s) => s.is_done).length;
  const lastDone = [...steps].reverse().find((s) => s.is_done);
  return (
    <div className="flex items-center gap-2 border-t border-dashed border-border pt-3 text-[11.5px] text-text-muted">
      <em className="mr-1 font-semibold not-italic">구매</em>
      {steps.map((s, i) => (
        <span key={s.id} className="flex items-center gap-2">
          {i > 0 && <span className={`h-0.5 w-3.5 ${s.is_done ? "bg-tile-green-fg" : "bg-border"}`} />}
          <span title={s.label} className={`h-[9px] w-[9px] rounded-full ${s.is_done ? "bg-tile-green-fg" : "bg-border"}`} />
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
            <div className="flex flex-col items-center gap-4 border-r border-border px-8 py-[22px]">
              <Ring percent={p.progress_percent} color={color} />
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

            <div className="flex min-w-0 max-w-[640px] flex-col gap-3.5 px-[28px] py-[22px]">
              <div className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.name}</span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE_CHIP[due.tone]}`}>{due.label}</span>
              </div>

              {p.stages.length === 0 ? (
                <p className="py-3 text-xs text-text-muted">등록된 진행 단계가 없습니다. 프로젝트를 열어 진행 단계를 추가하세요.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {p.stages.map((s) => (
                    <div key={s.id} className="grid grid-cols-[84px_1fr_38px] items-center gap-2.5">
                      <span className={`truncate text-[12.5px] ${s.progress_percent === 0 ? "text-text-muted/60" : "text-text-muted"}`} title={s.name}>
                        {s.name}
                      </span>
                      <div
                        className="h-2.5 overflow-hidden rounded-full bg-border"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={s.progress_percent}
                        aria-label={`${s.name} 진행률`}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${s.progress_percent}%`, background: s.progress_percent === 100 ? "var(--color-tile-green-fg)" : color }}
                        />
                      </div>
                      <span className="text-right text-xs tabular-nums text-text-muted">{s.progress_percent}%</span>
                    </div>
                  ))}
                </div>
              )}

              <PurchaseDots steps={p.purchase_steps} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
