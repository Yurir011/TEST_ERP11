import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/** 프로젝트명 자동완성 검색창. 포커스하면 최근 1년간 프로젝트명이 목록으로 뜨고, 글자를 입력하면 포함된 이름만 남는다.
 *  목록에서 고르지 않고 거래처·담당자·번호를 그냥 입력해 검색할 수도 있다. */
export function ProjectSearchBox({
  value,
  onChange,
  projectNames,
}: {
  value: string;
  onChange: (value: string) => void;
  projectNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  const options = useMemo(
    () => (q ? projectNames.filter((n) => n.toLowerCase().includes(q)) : projectNames),
    [projectNames, q]
  );

  // 입력값이 바뀌거나 목록을 열고 닫으면 키보드 선택 위치를 처음으로 되돌린다 (렌더 중 조정: 효과로 한 번 더 그리지 않는다).
  const resetKey = `${open}|${value}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setActive(-1);
  }

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(name: string) {
    console.debug(`[ProjectSearch] 프로젝트 선택: ${name}`);
    onChange(name);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative w-56">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="프로젝트·거래처 검색"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full text-xs border border-border rounded-lg pl-7 pr-7 py-2 bg-surface outline-none focus:border-primary"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setOpen(true);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
          title="검색어 지우기"
        >
          <X size={13} />
        </button>
      )}

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto py-1">
          <p className="px-3 py-1 text-[11px] text-text-muted">최근 1년 프로젝트</p>
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-muted">일치하는 프로젝트가 없습니다.</p>
          ) : (
            options.map((name, i) => (
              <button
                key={name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(name)}
                className={`block w-full text-left px-3 py-1.5 text-xs truncate ${
                  i === active ? "bg-tile-blue text-tile-blue-fg" : "hover:bg-bg"
                }`}
                title={name}
              >
                {name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
