import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet, downloadFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { DeliveryStats } from "./types";

const fmt = (n: number) => n.toLocaleString("en-US");

/** 증감률 글자: "+45%" (작년 값이 0이면 비교하지 않는다) */
export function changeText(now: number, prev: number): string | null {
  if (prev <= 0) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/** 보기 좋은 y축 최대값 (1·2·5·10 × 10^n) */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

type Metric = "quantity" | "count";

function MonthlyBars({ stats, metric }: { stats: DeliveryStats; metric: Metric }) {
  const W = 620;
  const H = 220;
  const L = 40;
  const B = 24;
  const T = 8;
  const R = 6;
  const values = stats.monthly.map((m) => (metric === "quantity" ? m.quantity : m.count));
  const max = niceMax(Math.max(...values, 0));
  const cw = (W - L - R) / 12;
  const bw = Math.min(26, cw * 0.62);
  const unit = metric === "quantity" ? "개" : "회";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`월별 납품 ${metric === "quantity" ? "개수" : "횟수"}`} className="w-full h-auto">
      {[0, 1, 2, 3, 4].map((i) => {
        const y = T + (H - T - B) * (1 - i / 4);
        return (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={1} opacity={i === 0 ? 1 : 0.6} />
            <text x={L - 6} y={y + 4} textAnchor="end" fontSize={11} fill="var(--color-text-muted)">
              {fmt((max * i) / 4)}
            </text>
          </g>
        );
      })}
      {stats.monthly.map((m, i) => {
        const v = values[i];
        const h = ((H - T - B) * v) / max;
        const cx = L + cw * i + cw / 2;
        const y = H - B - h;
        return (
          <g key={m.month}>
            <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">
              {m.month}
            </text>
            {v > 0 && (
              <path
                d={`M${cx - bw / 2},${H - B} V${y + 4} a4,4 0 0 1 4,-4 h${bw - 8} a4,4 0 0 1 4,4 V${H - B} Z`}
                fill="var(--color-primary)"
              />
            )}
            <rect x={cx - cw / 2} y={T} width={cw} height={H - T - B} fill="transparent">
              <title>{`${m.month}월 · ${m.count}회 · ${fmt(m.quantity)}개`}</title>
            </rect>
          </g>
        );
      })}
      <text x={W - R} y={T + 2} textAnchor="end" fontSize={10} fill="var(--color-text-muted)" opacity={0}>
        {unit}
      </text>
    </svg>
  );
}

export function ProjectDeliveryStatsPage() {
  const [year, setYear] = useState<number | null>(null);
  const [stats, setStats] = useState<DeliveryStats | null>(null);
  const [metric, setMetric] = useState<Metric>("quantity");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const qs = year ? `?year=${year}` : "";
    logDebug("DeliveryStats", `연간 통계 조회: year=${year ?? "올해"}`);
    setError(null);
    apiGet<DeliveryStats>(`/api/projects/delivery-stats${qs}`)
      .then((s) => {
        setStats(s);
        if (year === null) setYear(s.year);
      })
      .catch((err) => {
        logError("DeliveryStats", "연간 통계 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "통계를 불러오지 못했습니다.");
      });
  }, [year]);

  async function handleExcel() {
    if (!stats) return;
    setExporting(true);
    logDebug("DeliveryStats", `엑셀 내려받기: year=${stats.year}`);
    try {
      await downloadFile(`/api/projects/delivery-stats/excel?year=${stats.year}`, `납품통계_${stats.year}.xlsx`);
    } catch (err) {
      logError("DeliveryStats", "엑셀 내려받기 실패", err);
      setError("엑셀을 내려받지 못했습니다.");
    } finally {
      setExporting(false);
    }
  }

  const qtyChange = stats ? changeText(stats.total_quantity, stats.prev_quantity) : null;
  const cntChange = stats ? changeText(stats.total_count, stats.prev_count) : null;
  const maxProjectQty = stats?.projects[0]?.quantity ?? 1;
  const maxCell = Math.max(1, ...(stats?.projects.flatMap((p) => p.months.map((m) => m.quantity)) ?? [1]));
  const perCount = stats && stats.total_count > 0 ? Math.round(stats.total_quantity / stats.total_count) : 0;

  return (
    <MainLayout
      title="납품 통계"
      description="프로젝트에 기록한 납품을 연간으로 모아 보여 줍니다."
      actions={
        <div className="flex items-center gap-2">
          <select
            aria-label="연도"
            value={year ?? ""}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {(stats?.years ?? (year ? [year] : [])).map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleExcel()}
            disabled={!stats || exporting}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-bg disabled:opacity-50"
          >
            <Download size={15} />
            엑셀 내려받기
          </button>
        </div>
      }
    >
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-4">
        <ArrowLeft size={16} />
        프로젝트관리로
      </Link>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      {!stats && !error && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {stats && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-semibold text-text-muted">납품 횟수</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{fmt(stats.total_count)}회</p>
              <p className="text-xs text-text-muted">월 평균 {(stats.total_count / 12).toFixed(1)}회</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-semibold text-text-muted">납품 개수</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{fmt(stats.total_quantity)}개</p>
              <p className="text-xs text-text-muted">회당 평균 {fmt(perCount)}개</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-semibold text-text-muted">납품한 프로젝트</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.project_count}건</p>
              <p className="text-xs text-text-muted">거래처 {stats.client_count}곳</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-semibold text-text-muted">작년 같은 기간 대비</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${qtyChange?.startsWith("-") ? "text-danger" : "text-success"}`}>{qtyChange ?? "-"}</p>
              <p className="text-xs text-text-muted">
                개수 (작년 {fmt(stats.prev_quantity)}개){cntChange ? ` · 횟수 ${cntChange}` : ""}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-text-muted">월별 납품 {metric === "quantity" ? "개수" : "횟수"}</h2>
                <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs" role="group" aria-label="보기 기준">
                  {(["quantity", "count"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={metric === m}
                      onClick={() => setMetric(m)}
                      className={`px-3 py-1.5 ${metric === m ? "bg-tile-blue font-semibold text-tile-blue-fg" : "bg-surface text-text-muted hover:bg-bg"}`}
                    >
                      {m === "quantity" ? "개수" : "횟수"}
                    </button>
                  ))}
                </div>
              </div>
              <MonthlyBars stats={stats} metric={metric} />
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-text-muted">프로젝트별 (개수 순)</h2>
              {stats.projects.length === 0 ? (
                <p className="text-sm text-text-muted">{stats.year}년에 기록된 납품이 없습니다.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {stats.projects.map((p) => (
                    <li key={p.project_id} className="grid grid-cols-[minmax(0,8em)_1fr_auto] items-center gap-2.5 text-sm">
                      <Link to={`/projects/${p.project_id}`} className="truncate hover:underline" title={`${p.name} · ${p.client_name}`}>
                        {p.name}
                      </Link>
                      <span className="h-3 overflow-hidden rounded bg-tile-blue">
                        <i className="block h-full rounded-r bg-primary" style={{ width: `${(p.quantity / maxProjectQty) * 100}%` }} />
                      </span>
                      <span className="whitespace-nowrap text-right font-semibold tabular-nums">
                        {fmt(p.quantity)}개 <small className="font-normal text-text-muted">· {p.count}회</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-muted">프로젝트 × 월 상세 (칸이 진할수록 개수 많음)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-right text-text-muted">
                    <th className="px-1.5 py-1.5 text-left font-semibold">프로젝트</th>
                    {stats.monthly.map((m) => (
                      <th key={m.month} className="px-1.5 py-1.5 font-semibold whitespace-nowrap">
                        {m.month}월
                      </th>
                    ))}
                    <th className="px-1.5 py-1.5 font-semibold">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.projects.map((p) => {
                    const byMonth = new Map(p.months.map((m) => [m.month, m]));
                    return (
                      <tr key={p.project_id} className="border-t border-border text-right tabular-nums">
                        <td className="px-1.5 py-1.5 text-left whitespace-nowrap">
                          <Link to={`/projects/${p.project_id}`} className="hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        {stats.monthly.map((m) => {
                          const c = byMonth.get(m.month);
                          if (!c) {
                            return (
                              <td key={m.month} className="px-1.5 py-1.5 text-text-faint">
                                -
                              </td>
                            );
                          }
                          const pct = 14 + (66 * c.quantity) / maxCell;
                          return (
                            <td
                              key={m.month}
                              title={`${p.name} · ${m.month}월 · ${c.count}회 · ${fmt(c.quantity)}개`}
                              className="rounded px-1.5 py-1.5"
                              style={{ background: `color-mix(in srgb, var(--color-primary) ${pct}%, var(--color-surface))`, color: pct > 52 ? "#fff" : undefined }}
                            >
                              {fmt(c.quantity)}
                            </td>
                          );
                        })}
                        <td className="px-1.5 py-1.5 font-bold whitespace-nowrap">
                          {fmt(p.quantity)} <small className="font-normal text-text-muted">({p.count}회)</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border text-right font-bold tabular-nums">
                    <td className="px-1.5 py-1.5 text-left">월 합계</td>
                    {stats.monthly.map((m) => (
                      <td key={m.month} className="px-1.5 py-1.5">
                        {m.quantity ? (
                          <>
                            {fmt(m.quantity)}
                            <br />
                            <small className="font-normal text-text-muted">{m.count}회</small>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    ))}
                    <td className="px-1.5 py-1.5">
                      {fmt(stats.total_quantity)}
                      <br />
                      <small className="font-normal text-text-muted">{stats.total_count}회</small>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
