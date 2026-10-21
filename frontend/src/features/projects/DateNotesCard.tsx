import { CalendarDays, CornerDownRight, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { isAdminRole } from "../../lib/auth";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import {
  MAX_NOTE_LENGTH,
  WEEKDAYS,
  formatNoteDate,
  formatNoteDateTime,
  formatNoteTime,
  groupNotesByDate,
  monthCells,
  offsetFromStart,
  repliesByParent,
  threadOf,
  type ProjectDateNote,
} from "./dateNotes";
import { parseDate } from "./timeline";
import type { Project } from "./types";

// "날짜별 메모": 평소에는 날짜별 메모 목록만 보이고, 날짜 버튼을 눌렀을 때만 작은 달력이 뜬다. 메모마다 작성자와 시간이 남는다.
export function DateNotesCard({ project }: { project: Project }) {
  const { user } = useAuth();
  const { confirm } = useDialog();
  const today = todayISO();
  const [notes, setNotes] = useState<ProjectDateNote[] | null>(null);
  const [selected, setSelected] = useState(today);
  const [viewMonth, setViewMonth] = useState(() => ({ year: parseDate(today).getFullYear(), month: parseDate(today).getMonth() }));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 답글: 어느 메모에 답글을 쓰는 중인지와 그 내용
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  // 메모·답글 수정: 고치는 중인 글과 그 내용
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    logDebug("DateNotes", `날짜별 메모 조회: project_id=${project.id}`);
    apiGet<ProjectDateNote[]>(`/api/projects/${project.id}/date-notes`)
      .then(setNotes)
      .catch((err) => {
        logError("DateNotes", "날짜별 메모 조회 실패", err);
        setError("메모를 불러오지 못했습니다.");
      });
  }, [project.id]);

  useEffect(() => {
    load();
  }, [load]);

  // 달력 바깥을 누르면 닫는다
  useEffect(() => {
    if (!calendarOpen) return;
    function onDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setCalendarOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [calendarOpen]);

  const countByDate = new Map<string, number>();
  for (const n of (notes ?? []).filter((x) => x.parent_id === null)) countByDate.set(n.note_date, (countByDate.get(n.note_date) ?? 0) + 1);

  function selectDate(date: string) {
    setSelected(date);
    const d = parseDate(date);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
    setCalendarOpen(false);
  }

  function shiftMonth(delta: number) {
    setViewMonth(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || saving) return;
    setError(null);
    setSaving(true);
    logDebug("DateNotes", `메모 추가 시도: project_id=${project.id}, date=${selected}`);
    try {
      await apiPost(`/api/projects/${project.id}/date-notes`, { note_date: selected, content });
      setText("");
      load();
    } catch (err) {
      logError("DateNotes", "메모 추가 실패", err);
      setError(err instanceof ApiError ? err.message : "메모를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReply(e: FormEvent, parent: ProjectDateNote) {
    e.preventDefault();
    const content = replyText.trim();
    if (!content || saving) return;
    setError(null);
    setSaving(true);
    logDebug("DateNotes", `답글 추가 시도: project_id=${project.id}, parent_id=${parent.id}`);
    try {
      await apiPost(`/api/projects/${project.id}/date-notes`, { parent_id: parent.id, content });
      setReplyText("");
      setReplyTo(null);
      load();
    } catch (err) {
      logError("DateNotes", "답글 추가 실패", err);
      setError(err instanceof ApiError ? err.message : "답글을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(e: FormEvent, note: ProjectDateNote) {
    e.preventDefault();
    const content = editText.trim();
    if (!content || saving) return;
    if (content === note.content) {
      setEditingId(null);
      return;
    }
    setError(null);
    setSaving(true);
    logDebug("DateNotes", `메모 수정 시도: id=${note.id}`);
    try {
      await apiPut(`/api/projects/${project.id}/date-notes/${note.id}`, { content });
      setEditingId(null);
      load();
    } catch (err) {
      logError("DateNotes", "메모 수정 실패", err);
      setError(err instanceof ApiError ? err.message : "메모를 수정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(note: ProjectDateNote) {
    const below = threadOf(note.id, replies).length; // 이 글 아래에 달린 답글·대댓글 수
    const message = note.parent_id !== null ? `이 답글을 삭제하시겠습니까?${below ? " 그 아래 답글도 함께 삭제됩니다." : ""}` : `${formatNoteDate(note.note_date)} 메모를 삭제하시겠습니까?${below ? " 달린 답글도 함께 삭제됩니다." : ""}`;
    if (!(await confirm(message, { okLabel: "삭제", danger: true }))) return;
    logDebug("DateNotes", `메모 삭제 시도: id=${note.id}`);
    try {
      await apiDelete(`/api/projects/${project.id}/date-notes/${note.id}`);
      load();
    } catch (err) {
      logError("DateNotes", "메모 삭제 실패", err);
      setError(err instanceof ApiError ? err.message : "메모를 삭제하지 못했습니다.");
    }
  }

  const groups = groupNotesByDate(notes ?? []);
  const replies = repliesByParent(notes ?? []);
  const canDelete = (n: ProjectDateNote) => !!user && (n.created_by === user.id || isAdminRole(user.role));
  const canEdit = (n: ProjectDateNote) => !!user && n.created_by === user.id; // 수정은 쓴 사람만

  /** 메모(원 메모) 또는 답글 한 칸: 내용(또는 수정 입력)·작성자·시각·답글/수정/삭제 버튼. 답글 입력칸은 그 글 바로 아래에 열린다. */
  function renderEntry(n: ProjectDateNote, root: ProjectDateNote) {
    const isRoot = n.parent_id === null;
    const editing = editingId === n.id;
    const below = threadOf(n.id, replies).length;
    const directCount = replies.get(n.id)?.length ?? 0;
    return (
      <>
        <div className={`${isRoot ? "bg-tile-orange border border-tile-orange-fg/20 pl-3.5" : "min-w-0 flex-1 bg-bg border border-border pl-3"} rounded-xl pr-2 ${isRoot ? "py-2.5" : "py-2"} text-[13px]`}>
          {editing ? (
            <form onSubmit={(e) => handleSaveEdit(e, n)} className="flex flex-col gap-1.5">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={MAX_NOTE_LENGTH}
                aria-label="메모 수정"
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setEditingId(null)} className="h-8 px-3 rounded-lg border border-border bg-surface text-xs hover:bg-bg">
                  취소
                </button>
                <button type="submit" disabled={!editText.trim() || saving} className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-hover disabled:opacity-50">
                  저장
                </button>
              </div>
            </form>
          ) : (
            <p className="mb-1 whitespace-pre-wrap break-words">
              {!isRoot && n.parent_id !== root.id && n.reply_to_name && <b className="mr-1 font-semibold text-primary">@{n.reply_to_name}</b>}
              {n.content}
            </p>
          )}
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-[11.5px] text-text-muted tabular-nums">
              {n.author_name ?? "알 수 없음"} · {isRoot ? formatNoteTime(n.created_at) : formatNoteDateTime(n.created_at)}
              {n.edited_at ? " · 수정됨" : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setReplyTo((cur) => (cur === n.id ? null : n.id));
                setReplyText("");
              }}
              aria-label={isRoot ? "답글 달기" : "대댓글 달기"}
              className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11.5px] text-text-muted hover:text-primary hover:bg-black/5"
            >
              <CornerDownRight size={12} />
              답글{isRoot && below > 0 ? ` ${below}` : directCount > 0 ? ` ${directCount}` : ""}
            </button>
            {canEdit(n) && !editing && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(n.id);
                  setEditText(n.content);
                }}
                aria-label={isRoot ? "메모 수정" : "답글 수정"}
                title="수정"
                className="p-1 rounded-md text-text-muted hover:text-primary hover:bg-black/5"
              >
                <Pencil size={13} />
              </button>
            )}
            {canDelete(n) && (
              <button type="button" onClick={() => handleDelete(n)} aria-label={isRoot ? "메모 삭제" : "답글 삭제"} title="삭제" className="p-1 rounded-md text-text-muted hover:text-danger hover:bg-black/5">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
        {replyTo === n.id && (
          <form onSubmit={(e) => handleReply(e, n)} className={`mt-1 flex items-start gap-1.5 ${isRoot ? "ml-5" : ""}`}>
            <CornerDownRight size={13} className="mt-3 shrink-0 text-text-muted" />
            <textarea
              autoFocus
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={isRoot ? "답글을 입력하세요" : `${n.author_name ?? "작성자"}님에게 답글을 입력하세요`}
              aria-label="답글 입력"
              rows={2}
              className="flex-1 min-w-0 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || saving}
              className="h-9 px-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              등록
            </button>
          </form>
        )}
      </>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-sm font-semibold">날짜별 메모</h2>
        <span className="text-xs text-text-muted">{notes ? `${notes.filter((n) => n.parent_id === null).length}개${notes.some((n) => n.parent_id !== null) ? ` · 답글 ${notes.filter((n) => n.parent_id !== null).length}개` : ""} · 최근 날짜 순` : ""}</span>
      </div>

      <form onSubmit={handleAdd} className="relative flex flex-wrap items-start gap-2 mb-4">
        <div ref={popoverRef} className="relative">
          <button
            type="button"
            onClick={() => setCalendarOpen((v) => !v)}
            aria-expanded={calendarOpen}
            className={`flex items-center gap-2 h-10 px-3 rounded-lg border text-sm whitespace-nowrap ${
              calendarOpen ? "border-primary bg-tile-blue" : "border-border bg-bg hover:border-primary hover:bg-tile-blue"
            }`}
          >
            <CalendarDays size={15} />
            {formatNoteDate(selected)} ▾
          </button>
          {calendarOpen && (
            <div role="dialog" aria-label="날짜 지정" className="absolute left-0 top-11 z-20 w-[292px] bg-surface border border-border rounded-xl p-3 shadow-lg">
              <div className="flex items-center gap-1.5 mb-2">
                <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달" className="w-6 h-6 rounded-md border border-border text-text-muted hover:bg-bg">
                  ‹
                </button>
                <b className="flex-1 text-center text-[13px]">
                  {viewMonth.year}년 {viewMonth.month + 1}월
                </b>
                <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달" className="w-6 h-6 rounded-md border border-border text-text-muted hover:bg-bg">
                  ›
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={`text-center text-[11px] pb-1 ${i === 0 ? "text-danger" : i === 6 ? "text-primary" : "text-text-muted"}`}>
                    {w}
                  </div>
                ))}
                {monthCells(viewMonth.year, viewMonth.month).map(({ date, inMonth }) => {
                  const count = countByDate.get(date) ?? 0;
                  const inRange = !!project.start_date && !!project.end_date && date >= project.start_date && date <= project.end_date;
                  const isSelected = date === selected;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => selectDate(date)}
                      aria-label={`${formatNoteDate(date)}${count ? ` 메모 ${count}개` : ""}`}
                      className={`h-[34px] rounded-lg border flex flex-col items-center justify-center gap-px ${
                        isSelected ? "border-primary bg-tile-blue" : inRange ? "border-transparent bg-tile-blue/60 hover:bg-bg" : "border-transparent hover:bg-bg"
                      } ${inMonth ? "" : "opacity-35"}`}
                    >
                      <span className={`text-[12.5px] tabular-nums ${date === today ? "bg-danger text-white rounded-full px-1.5" : ""}`}>
                        {parseDate(date).getDate()}
                      </span>
                      <span className="flex gap-0.5 h-[5px]">
                        {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                          <i key={i} className="w-[5px] h-[5px] rounded-full bg-tile-orange-fg" />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2 text-[11.5px] text-text-muted">
                <span className="flex items-center gap-1">
                  <i className="w-[7px] h-[7px] rounded-full bg-tile-orange-fg" />
                  메모 있는 날
                </span>
                <button type="button" onClick={() => selectDate(today)} className="text-primary font-semibold text-xs">
                  오늘로
                </button>
              </div>
            </div>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="이 날짜에 남길 메모를 입력하세요"
          aria-label="메모 입력"
          rows={1}
          className="flex-1 min-w-[200px] h-10 focus:h-[68px] resize-none rounded-lg border border-border bg-bg focus:bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary transition-[height]"
        />
        <button
          type="submit"
          disabled={!text.trim() || saving}
          className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          저장
        </button>
      </form>

      {error && <p className="text-xs text-danger mb-3">{error}</p>}

      {notes === null && !error && <p className="text-sm text-text-muted">불러오는 중...</p>}
      {notes !== null && groups.length === 0 && (
        <div className="bg-bg border border-dashed border-border rounded-xl p-5 text-center text-xs text-text-muted">
          아직 남긴 메모가 없습니다. 위에서 날짜를 지정해 첫 메모를 남겨 보세요.
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {groups.map((g) => {
          const d = parseDate(g.date);
          const offset = offsetFromStart(g.date, project.start_date);
          return (
            <div key={g.date} className="grid grid-cols-[78px_1fr] gap-3">
              <div className={`self-start text-center bg-bg border rounded-xl px-1 py-2 ${g.date === today ? "border-danger" : "border-border"}`}>
                <b className={`block text-base tabular-nums leading-tight ${g.date === today ? "text-danger" : ""}`}>
                  {d.getMonth() + 1}/{String(d.getDate()).padStart(2, "0")}
                </b>
                <small className="text-[11px] text-text-muted">
                  {WEEKDAYS[d.getDay()]}
                  {offset ? ` · ${offset}` : ""}
                </small>
              </div>
              <ul className="flex flex-col gap-1.5 min-w-0">
                {g.notes.map((n) => (
                  <li key={n.id} className="min-w-0">
                    {renderEntry(n, n)}
                    {/* 답글·대댓글: 첫 단계에서 한 번만 들여쓰고, 그 아래 단계는 같은 들여쓰기로 이어진다 (누구에게 단 답글인지는 @이름으로 표시) */}
                    {threadOf(n.id, replies).map((r) => (
                      <div key={r.id} className="mt-1 ml-5">
                        <div className="flex gap-1.5">
                          <CornerDownRight size={13} className="mt-3 shrink-0 text-text-muted" />
                          <div className="min-w-0 flex-1">{renderEntry(r, n)}</div>
                        </div>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
