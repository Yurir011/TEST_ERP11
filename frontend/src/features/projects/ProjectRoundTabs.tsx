import { Check, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiGet, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { roundPeriod } from "./rounds";
import type { Project } from "./types";

// 상세 화면 제목 바로 밑의 회차 탭 (같은 묶음의 모든 회차, 시작일 순). 진행 중인 회차는 파란색으로 채운다.
/** 탭에 보이는 이름: 직접 지정한 이름이 있으면 그것, 없으면 "N회차" */
export function roundName(r: Pick<Project, "round_no" | "round_label">): string {
  return r.round_label?.trim() || `${r.round_no}회차`;
}

export function ProjectRoundTabs({ project, onRenamed }: { project: Project; onRenamed?: (updated: Project) => void }) {
  const [rounds, setRounds] = useState<Project[]>([]);
  // 지금 보는 탭의 이름 바꾸기 (연필 → 입력칸, Enter 저장 / Esc 취소, 비우고 저장하면 기본 이름으로 되돌아간다)
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  async function saveLabel() {
    setSaving(true);
    setRenameError(null);
    logDebug("ProjectRounds", `회차 이름 변경 시도: project_id=${project.id}, label=${draft}`);
    try {
      const updated = await apiPut<Project>(`/api/projects/${project.id}/round-label`, { label: draft });
      setRounds((list) => list.map((r) => (r.id === updated.id ? { ...r, round_label: updated.round_label } : r)));
      onRenamed?.(updated);
      setEditing(false);
    } catch (err) {
      logError("ProjectRounds", "회차 이름 변경 실패", err);
      setRenameError(err instanceof ApiError ? err.message : "이름을 바꾸지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (project.series_id === null) {
      setRounds([]);
      return;
    }
    logDebug("ProjectRounds", `회차 탭 조회: project_id=${project.id}, series_id=${project.series_id}`);
    apiGet<Project[]>(`/api/projects/${project.id}/rounds`)
      .then((list) => setRounds(list.filter((r) => r.round_no !== null)))
      .catch((err) => logError("ProjectRounds", "회차 탭 조회 실패", err));
    // 상태·일정이 바뀌어도 탭 표시가 따라가도록 함께 본다
  }, [project.id, project.series_id, project.status, project.start_date, project.end_date]);

  if (project.series_id === null) return null;

  // 지금 보는 탭은 아래 카드와 같은 면으로 이어지고, 진행 중인 회차만 테마 포인트 색으로 불이 켜진다. 나머지는 꺼진 듯 흐리게.
  return (
    <div className="flex items-end gap-1 mb-6 px-2" role="tablist" aria-label="회차">
      {rounds.map((r) => {
        const selected = r.id === project.id;
        const active = r.status === "in_progress";
        const period = roundPeriod(r);
        const style = active
          ? { background: "var(--color-primary)", color: "var(--color-on-primary)", boxShadow: "0 0 14px color-mix(in srgb, var(--color-primary) 55%, transparent)" }
          : selected
            ? { background: "var(--color-surface)", color: "var(--color-text-muted)" }
            : {
                background: "color-mix(in srgb, var(--color-text-muted) 12%, var(--color-surface))",
                color: "color-mix(in srgb, var(--color-text-muted) 65%, var(--color-surface))",
              };
        const inner = (
          <>
            <span className="block text-sm font-semibold" style={selected && !active ? { color: "var(--color-text)" } : undefined}>
              {selected && editing ? (
                <span className="flex items-center gap-1">
                  <input
                    autoFocus
                    aria-label="회차 이름"
                    value={draft}
                    maxLength={50}
                    placeholder={`${r.round_no}회차`}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveLabel();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    className="w-28 rounded-md border border-border bg-bg px-2 py-0.5 text-sm font-semibold text-text outline-none focus:border-primary"
                  />
                  <button type="button" onClick={() => void saveLabel()} disabled={saving} aria-label="이름 저장" title="저장" className="p-1 text-primary disabled:opacity-50">
                    <Check size={14} />
                  </button>
                  <button type="button" onClick={() => setEditing(false)} aria-label="이름 변경 취소" title="취소" className="p-1 text-text-muted">
                    <X size={14} />
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  {roundName(r)}
                  {selected && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(r.round_label ?? "");
                        setRenameError(null);
                        setEditing(true);
                      }}
                      aria-label="회차 이름 변경"
                      title="이름 변경"
                      className="p-0.5 opacity-60 hover:opacity-100"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                </span>
              )}
            </span>
            <span className="block text-[11px]">
              {active && (
                <span
                  aria-hidden
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-[1px]"
                  style={{ background: "var(--color-on-primary)", boxShadow: "0 0 6px var(--color-on-primary)" }}
                />
              )}
              {period}
            </span>
          </>
        );
        return selected ? (
          <div key={r.id} role="tab" aria-selected style={style} className="rounded-t-xl px-4 py-2 text-left transition-colors">
            {inner}
          </div>
        ) : (
          <Link key={r.id} to={`/projects/${r.id}`} role="tab" aria-selected={false} style={style} className="rounded-t-xl px-4 py-2 text-left transition-colors">
            {inner}
          </Link>
        );
      })}
      {renameError && <p className="mb-1 ml-2 text-xs text-danger">{renameError}</p>}
      <Link
        to={`/projects/new?from=${project.id}`}
        className="mb-1 ml-1 flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-text-muted hover:text-primary hover:border-primary"
      >
        <Plus size={13} />
        다음 회차
      </Link>
    </div>
  );
}
