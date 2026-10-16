import { Search } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { MainLayout } from "../../components/layout/MainLayout";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { apiGet } from "../../lib/api";
import { toLocalISODate } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { ACTION_LABELS, ENTITY_FILTERS, fieldLabel, formatAuditValue, targetLabel, type AuditLogEntry } from "./auditLabels";

const PAGE_SIZE = 50;

type Period = "today" | "week" | "month" | "all";
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "week", label: "최근 7일" },
  { key: "month", label: "이번 달" },
  { key: "all", label: "전체" },
];

function periodStart(period: Period): string | null {
  const now = new Date();
  if (period === "today") return toLocalISODate(now);
  if (period === "week") return toLocalISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  if (period === "month") return toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  return null;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TONE_STYLES = {
  green: SOFT_BADGE.green,
  blue: SOFT_BADGE.blue,
  red: SOFT_BADGE.red,
  gray: SOFT_BADGE.gray,
  orange: SOFT_BADGE.orange,
} as const;

// 설정 › 변경 이력 (대표 전용). 돈·권한·삭제·로그인과 관련된 변경을 검색한다. 기록은 고치거나 지울 수 없다.
export function AuditLogsPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [keyword, setKeyword] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    const from = periodStart(period);
    if (from) params.set("date_from", from);
    if (entityType) params.set("entity_type", entityType);
    if (action) params.set("action", action);
    if (keyword.trim()) params.set("q", keyword.trim());
    let cancelled = false;
    // 검색어 입력 중에는 잠시 기다렸다가 조회한다
    const timer = setTimeout(() => {
      logDebug("AuditLogs", `변경 이력 조회: ${params.toString()}`);
      apiGet<AuditLogEntry[]>(`/api/audit-logs?${params.toString()}`)
        .then((data) => {
          if (cancelled) return;
          setError(null);
          setRows(data);
        })
        .catch((err) => {
          if (cancelled) return;
          logError("AuditLogs", "변경 이력 조회 실패", err);
          setError("변경 이력을 불러오지 못했습니다.");
          setRows([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [period, entityType, action, keyword, offset]);

  // 조건이 바뀌면 첫 페이지부터 다시 본다
  function changeFilter<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setOffset(0);
      setOpenId(null);
    };
  }

  const pageNo = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <MainLayout title="설정 · 변경 이력" description="돈·권한·삭제·로그인과 관련된 변경이 자동으로 기록됩니다. 기록은 고치거나 지울 수 없습니다.">
      <div className="bg-surface border border-border rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted">기간</span>
        <div className="flex gap-1 bg-bg rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => changeFilter(setPeriod)(p.key)}
              className={`px-3 py-1 rounded-md text-xs transition-colors ${period === p.key ? "bg-surface font-medium text-text shadow-sm" : "text-text-muted hover:text-text"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="text-xs text-text-muted ml-2" htmlFor="audit-entity">
          대상
        </label>
        <select
          id="audit-entity"
          value={entityType}
          onChange={(e) => changeFilter(setEntityType)(e.target.value)}
          className="text-sm border border-border rounded-lg px-2 py-1.5 bg-bg outline-none focus:border-primary"
        >
          {ENTITY_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="text-xs text-text-muted ml-2" htmlFor="audit-action">
          동작
        </label>
        <select
          id="audit-action"
          value={action}
          onChange={(e) => changeFilter(setAction)(e.target.value)}
          className="text-sm border border-border rounded-lg px-2 py-1.5 bg-bg outline-none focus:border-primary"
        >
          <option value="">전체</option>
          <option value="create">등록</option>
          <option value="update">수정</option>
          <option value="delete">삭제</option>
          <option value="login">로그인</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={keyword}
            onChange={(e) => changeFilter(setKeyword)(e.target.value)}
            placeholder="내용·사람으로 검색 (예: 크레신, 김영희)"
            className="w-full rounded-lg border border-border pl-9 pr-3 py-1.5 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}
      {rows === null && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {rows !== null && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2.5 px-4 font-medium w-px whitespace-nowrap">일시</th>
                <th className="py-2.5 px-4 font-medium w-px whitespace-nowrap">사람</th>
                <th className="py-2.5 px-4 font-medium w-px whitespace-nowrap">동작</th>
                <th className="py-2.5 px-4 font-medium w-px whitespace-nowrap">대상</th>
                <th className="py-2.5 px-4 font-medium">내용</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-text-muted">
                    조건에 맞는 기록이 없습니다.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const act = ACTION_LABELS[r.action] ?? { label: r.action, tone: "gray" as const };
                const isOpen = openId === r.id;
                const changes = Object.entries(r.changes ?? {});
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setOpenId(isOpen ? null : r.id)}
                      className="cursor-pointer border-b border-border hover:bg-primary/10 transition-colors"
                      title="눌러서 바뀐 항목 보기"
                    >
                      <td className="py-2.5 px-4 whitespace-nowrap tabular-nums text-xs text-text-muted">{formatWhen(r.created_at)}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {r.user_name ?? "(알 수 없음)"}
                        {r.ip && <span className="block text-[11px] text-text-muted">{r.ip}</span>}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className={`text-xs px-2 py-1 font-medium ${TONE_STYLES[act.tone]}`}>{act.label}</span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-xs text-text-muted">{targetLabel(r)}</td>
                      <td className="py-2.5 px-4 break-words">{r.summary ?? "-"}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-bg border-b border-border">
                        <td colSpan={5} className="px-4 pb-3 pt-1">
                          {changes.length === 0 ? (
                            <p className="text-xs text-text-muted py-2">바뀐 항목이 없는 기록입니다 (로그인 등).</p>
                          ) : (
                            <table className="w-full text-xs mt-1">
                              <thead>
                                <tr className="text-left text-text-muted">
                                  <th className="py-1.5 pr-4 font-medium w-40">항목</th>
                                  <th className="py-1.5 pr-4 font-medium">전</th>
                                  <th className="py-1.5 font-medium">후</th>
                                </tr>
                              </thead>
                              <tbody>
                                {changes.map(([field, [before, after]]) => (
                                  <tr key={field} className="border-t border-dashed border-border">
                                    <td className="py-1.5 pr-4 text-text-muted">{fieldLabel(field)}</td>
                                    <td className="py-1.5 pr-4 text-danger/80 line-through decoration-danger/40 break-all">{formatAuditValue(before)}</td>
                                    <td className="py-1.5 text-success font-medium break-all">{formatAuditValue(after)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <p className="text-[11px] text-text-muted mt-2 font-mono">요청: {r.request ?? "-"}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-2.5 text-xs text-text-muted">
            <span>
              {pageNo}쪽 · {rows.length}건
            </span>
            <span className="flex gap-1.5">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="border border-border rounded-lg px-3 py-1 bg-surface disabled:opacity-40"
              >
                이전
              </button>
              <button
                type="button"
                disabled={rows.length < PAGE_SIZE}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="border border-border rounded-lg px-3 py-1 bg-surface disabled:opacity-40"
              >
                다음
              </button>
            </span>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
