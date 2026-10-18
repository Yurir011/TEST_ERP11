import { ChevronDown, Mail, MailOpen, Paperclip, RefreshCw, Search, Star } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { MailFolder, MailSummary } from "../../lib/desktop";
import { PAGE_SIZES, folderLabel, formatMailDate, pageNumbers, senderLabel, subjectLabel } from "./mailFormat";

interface Props {
  title: string;
  items: MailSummary[];
  total: number;
  page: number;
  pageSize: number;
  selected: Set<number>;
  syncing: boolean;
  syncError: string | null;
  query: string;
  /** 서버에서 본문까지 찾는 중이거나, 그 결과로 목록이 좁혀진 상태 */
  searching: boolean;
  bodySearchActive: boolean;
  searchNotice: string | null;
  /** 지금 폴더가 휴지통이면 [삭제]는 완전 삭제가 된다 */
  inTrash: boolean;
  inJunk: boolean;
  /** [이동] 메뉴에 보일 폴더들 (지금 폴더와 가상 폴더는 뺀 것) */
  moveTargets: MailFolder[];
  onOpen: (id: number) => void;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: (on: boolean) => void;
  onToggleStar: (id: number, on: boolean) => void;
  onMarkSelected: (seen: boolean) => void;
  onDelete: () => void;
  onSpam: () => void;
  onForward: () => void;
  onMove: (dest: string) => void;
  onRefresh: () => void;
  onSearch: (query: string, includeBody: boolean) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

/** 메일 목록 화면: 폴더 이름 탭, 도구줄(선택·삭제·스팸신고·전달·이동·읽음 표시·새로고침·검색), 한 줄씩 보이는 목록, 쪽 번호 */
export function MailListView(p: Props) {
  const [markOpen, setMarkOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [text, setText] = useState(p.query);
  const [includeBody, setIncludeBody] = useState(false);
  const totalPages = Math.max(1, Math.ceil(p.total / p.pageSize));
  const allSelected = p.items.length > 0 && p.items.every((m) => p.selected.has(m.id));
  const none = p.selected.size === 0;

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    p.onSearch(text.trim(), includeBody);
  }

  const toolButton = "px-3 py-1.5 rounded-lg font-semibold hover:bg-bg disabled:text-text-muted/60 disabled:cursor-not-allowed disabled:hover:bg-transparent";

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
        <span className="inline-flex items-center rounded-lg bg-primary text-white text-sm font-medium px-4 py-2.5" aria-label="현재 폴더">{p.title}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-y border-border">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <input
            type="checkbox"
            aria-label="현재 쪽 메일 모두 선택"
            checked={allSelected}
            onChange={(e) => p.onToggleSelectAll(e.target.checked)}
            className="w-4 h-4 mr-3 accent-primary"
          />
          <button type="button" disabled={none} onClick={p.onDelete} className={toolButton} title={p.inTrash ? "선택한 메일을 서버에서 완전히 지웁니다" : "선택한 메일을 휴지통으로 옮깁니다"}>
            {p.inTrash ? "완전삭제" : "삭제"}
          </button>
          <button type="button" disabled={none || p.inJunk} onClick={p.onSpam} className={toolButton} title="선택한 메일을 스팸메일함으로 옮깁니다">
            스팸신고
          </button>
          <button type="button" disabled={p.selected.size !== 1} onClick={p.onForward} className={toolButton} title="메일 한 통을 골라 전달합니다">
            전달
          </button>
          <span className="w-px h-4 bg-border mx-2" />
          <div className="relative">
            <button
              type="button"
              disabled={none || p.moveTargets.length === 0}
              aria-haspopup="menu"
              aria-expanded={moveOpen}
              onClick={() => { setMoveOpen((v) => !v); setMarkOpen(false); }}
              className="px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:bg-bg disabled:text-text-muted/60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              이동 <ChevronDown size={14} />
            </button>
            {moveOpen && (
              <div role="menu" aria-label="이동할 폴더" className="absolute z-10 mt-1 w-44 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface shadow-md py-1">
                {p.moveTargets.map((f) => (
                  <button key={f.path} role="menuitem" type="button" onClick={() => { setMoveOpen(false); p.onMove(f.path); }} className="w-full text-left px-3 py-2 text-sm hover:bg-bg truncate">
                    {folderLabel(f)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              disabled={none}
              aria-haspopup="menu"
              aria-expanded={markOpen}
              onClick={() => { setMarkOpen((v) => !v); setMoveOpen(false); }}
              className="px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:bg-bg disabled:text-text-muted/60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              읽음 표시 <ChevronDown size={14} />
            </button>
            {markOpen && (
              <div role="menu" className="absolute z-10 mt-1 w-36 rounded-lg border border-border bg-surface shadow-md py-1">
                <button role="menuitem" type="button" onClick={() => { setMarkOpen(false); p.onMarkSelected(true); }} className="w-full text-left px-3 py-2 text-sm hover:bg-bg">읽음으로 표시</button>
                <button role="menuitem" type="button" onClick={() => { setMarkOpen(false); p.onMarkSelected(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-bg">안 읽음으로 표시</button>
              </div>
            )}
          </div>
          <span className="mx-2 text-text-muted tabular-nums" aria-label={`선택 ${p.selected.size}개, 전체 ${p.total}개`}>
            <span className="text-text font-medium">{p.selected.size}</span> / {p.total}
          </span>
          <button type="button" onClick={p.onRefresh} disabled={p.syncing} className="px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-bg disabled:opacity-60">
            새로고침 <RefreshCw size={14} className={p.syncing ? "animate-spin" : ""} />
          </button>
        </div>

        <form onSubmit={submitSearch} role="search" className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 w-[26rem] max-w-full">
          <Search size={15} className="text-text-muted shrink-0" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={includeBody ? "메일 검색 (제목·보낸 사람·본문)" : "메일 검색 (제목·보낸 사람)"}
            aria-label="메일 검색"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none"
          />
          <label className="flex items-center gap-1 text-xs text-text-muted shrink-0 cursor-pointer" title="서버에서 본문까지 찾습니다 (시간이 조금 걸릴 수 있습니다)">
            <input type="checkbox" checked={includeBody} onChange={(e) => setIncludeBody(e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
            본문 포함
          </label>
          {(text || p.bodySearchActive) && (
            <button type="button" aria-label="검색어 지우기" onClick={() => { setText(""); p.onSearch("", false); }} className="text-text-muted text-xs hover:text-text shrink-0">
              지우기
            </button>
          )}
        </form>
      </div>

      {p.searching && <p role="status" className="px-6 py-2 text-xs text-text-muted border-b border-border">서버에서 본문까지 검색하는 중...</p>}
      {p.searchNotice && <p role="alert" className="px-6 py-2 text-xs text-danger border-b border-border">{p.searchNotice}</p>}
      {p.bodySearchActive && !p.searching && !p.searchNotice && <p className="px-6 py-2 text-xs text-text-muted border-b border-border">서버에서 본문까지 검색한 결과입니다.</p>}
      {p.syncError && <p role="alert" className="px-6 py-2 text-xs text-danger border-b border-border">{p.syncError}</p>}

      <ul className="flex-1 overflow-y-auto" aria-label="메일 목록">
        {p.items.map((m) => (
          <li key={m.id} className={`group flex items-center gap-3 px-6 h-[62px] border-b border-border hover:bg-bg/70 ${p.selected.has(m.id) ? "bg-primary/5" : ""}`}>
            <input type="checkbox" aria-label={`${subjectLabel(m)} 선택`} checked={p.selected.has(m.id)} onChange={() => p.onToggleSelect(m.id)} className="w-4 h-4 accent-primary shrink-0" />
            <button
              type="button"
              aria-label={m.flagged ? "중요 표시 해제" : "중요 표시"}
              aria-pressed={m.flagged}
              onClick={() => p.onToggleStar(m.id, !m.flagged)}
              className={`shrink-0 p-1 rounded ${m.flagged ? "text-tile-orange-fg" : "text-text-muted/50 hover:text-text-muted"}`}
            >
              <Star size={17} fill={m.flagged ? "currentColor" : "none"} />
            </button>
            <span className="shrink-0 text-text-muted" aria-label={m.seen ? "읽음" : "안 읽음"}>
              {m.seen ? <MailOpen size={17} /> : <Mail size={17} className="text-primary" />}
            </span>
            <button type="button" onClick={() => p.onOpen(m.id)} className="flex-1 min-w-0 flex items-center gap-4 text-left h-full" aria-label={`메일 열기: ${subjectLabel(m)}`}>
              <span className={`w-44 shrink-0 truncate text-[15px] ${m.seen ? "text-text-muted" : "font-semibold"}`}>{senderLabel(m)}</span>
              <span className={`flex-1 min-w-0 truncate text-[15px] ${m.seen ? "text-text-muted" : "text-text"}`}>{subjectLabel(m)}</span>
              {m.hasAttachments && <Paperclip size={14} className="shrink-0 text-text-muted" aria-label="첨부 파일 있음" />}
              <span className="shrink-0 w-16 text-right text-sm text-text-muted tabular-nums">{formatMailDate(m.date)}</span>
            </button>
          </li>
        ))}
        {p.items.length === 0 && (
          <li className="px-6 py-16 text-center text-sm text-text-muted">{p.syncing || p.searching ? "메일을 가져오는 중..." : "메일이 없습니다."}</li>
        )}
      </ul>

      <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-border">
        <span className="w-28" />
        <nav aria-label="쪽 이동" className="flex items-center gap-1">
          {p.page > 1 && (
            <button type="button" onClick={() => p.onPage(p.page - 1)} aria-label="이전 쪽" className="px-2.5 py-1.5 rounded-lg border border-border text-sm hover:bg-bg">‹</button>
          )}
          {pageNumbers(p.page, totalPages).map((n) => (
            <button
              key={n}
              type="button"
              aria-current={n === p.page ? "page" : undefined}
              onClick={() => p.onPage(n)}
              className={`min-w-[34px] px-2.5 py-1.5 rounded-lg border text-sm tabular-nums ${n === p.page ? "border-text font-semibold" : "border-border hover:bg-bg"}`}
            >
              {n}
            </button>
          ))}
          {p.page < totalPages && (
            <button type="button" onClick={() => p.onPage(p.page + 1)} aria-label="다음 쪽" className="px-2.5 py-1.5 rounded-lg border border-border text-sm hover:bg-bg">›</button>
          )}
        </nav>
        <label className="flex items-center gap-1.5 text-sm w-28 justify-end">
          <span className="sr-only">보기 설정</span>
          <select
            aria-label="보기 설정"
            value={p.pageSize}
            onChange={(e) => p.onPageSize(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}개씩</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
