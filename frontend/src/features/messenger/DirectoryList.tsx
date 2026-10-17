import { Search } from "lucide-react";
import { useState } from "react";
import { GRADE_LABELS, TITLE_LABELS, type JobGrade, type JobTitle } from "../../lib/auth";
import { PresenceBadge } from "./PresenceBadge";
import { filterByName } from "./presence";
import type { DirectoryUser } from "./types";

function roleLine(u: DirectoryUser): string {
  const title = u.title ? TITLE_LABELS[u.title as JobTitle] : null;
  return [GRADE_LABELS[u.grade as JobGrade], title].filter(Boolean).join(" · ");
}

interface Props {
  /** 보여 줄 직원 (즐겨찾기 탭은 즐겨찾기한 사람만, 전체 목록 탭은 전원) */
  users: DirectoryUser[] | null;
  /** all: 이름 옆 체크박스로 즐겨찾기를 넣고 뺀다 / favorites: 체크박스 없이 상태만 보며 대화를 연다 */
  mode: "all" | "favorites";
  onOpen: (userId: number) => void;
  onToggleFavorite: (userId: number, on: boolean) => void;
}

/** 직원 목록 (이름, 직급, 현재 상태). 이름을 누르면 그 사람과의 1:1 대화를 연다. */
export function DirectoryList({ users, mode, onOpen, onToggleFavorite }: Props) {
  const [query, setQuery] = useState("");
  const visible = users ? filterByName(users, query) : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col" aria-label={mode === "all" ? "전체 직원 목록" : "즐겨찾기 목록"}>
      <div className="p-3 border-b border-border">
        <label className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2">
          <Search size={14} className="text-text-muted shrink-0" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 검색"
            aria-label="직원 이름 검색"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {visible === null && <p className="p-4 text-sm text-text-muted">불러오는 중...</p>}
        {visible && visible.length === 0 && (
          <p className="p-4 text-sm text-text-muted">
            {query.trim() ? "검색 결과가 없습니다." : mode === "favorites" ? "즐겨찾기한 직원이 없습니다. [전체목록]에서 이름 옆 체크박스를 눌러 추가하세요." : "표시할 직원이 없습니다."}
          </p>
        )}
        {visible?.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-bg/60">
            {mode === "all" && (
              <input
                type="checkbox"
                checked={u.is_favorite}
                onChange={(e) => onToggleFavorite(u.id, e.target.checked)}
                aria-label={`${u.name} 즐겨찾기`}
                title="즐겨찾기"
                className="accent-primary shrink-0"
              />
            )}
            <button type="button" onClick={() => onOpen(u.id)} title={`${u.name}님과 대화`} className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-medium truncate">{u.name}</span>
              <span className="block text-[11px] text-text-muted truncate">{roleLine(u)}</span>
            </button>
            <PresenceBadge status={u.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
