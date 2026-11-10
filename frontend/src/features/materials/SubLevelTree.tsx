import { Plus, X } from "lucide-react";
import { useState } from "react";
import { MAX_LEVEL_SLOTS, MIN_LEVEL_SLOTS } from "./types";

/**
 * 속성 입력: 번호 붙은 작은 칸들을 가로로 나란히 (비워 둔 칸은 저장하지 않는다).
 * 칸을 누르면 아래로 "이전에 쓴 속성"(그 칸 자리에 쓴 값들)이 나열되고, 글자를 치면 맞는 것만 남는다. 하나를 누르면 그 값이 입력된다.
 * 기본 3칸을 보여 주고 [+ 추가]로 최대 10단계까지 늘린다 (기본 3칸을 넘어선 칸은 ×로 지울 수 있다).
 * @param levels 지금 입력된 칸들 (빈 칸 포함)
 * @param onChange 칸이 바뀔 때 새 목록
 * @param history 이전에 쓴 속성. history[i] 는 (i+1)번째 칸에 썼던 값들 (많이 쓴 순서)
 */
export function SubLevelEditor({ levels, onChange, history = [] }: { levels: string[]; onChange: (next: string[]) => void; history?: string[][] }) {
  const slots = levels.length >= MIN_LEVEL_SLOTS ? levels : [...levels, ...Array(MIN_LEVEL_SLOTS - levels.length).fill("")];
  const hints = ["예: MCU", "예: Cortex-M3", "예: LQFP48"];
  const [focused, setFocused] = useState<number | null>(null);

  function set(i: number, v: string) {
    const next = [...slots];
    next[i] = v;
    onChange(next);
  }

  function suggestions(i: number): string[] {
    const q = slots[i].trim().toLowerCase();
    return (history[i] ?? []).filter((x) => x !== slots[i] && (!q || x.toLowerCase().includes(q)));
  }

  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-2.5">
      {slots.map((v, i) => {
        const list = focused === i ? suggestions(i) : [];
        return (
          <span key={i} className="inline-flex items-start gap-1">
            <span aria-hidden className="text-[11px] text-text-muted pt-2.5">
              {i + 1}
            </span>
            <span className="relative">
              <input
                value={v}
                onChange={(e) => set(i, e.target.value)}
                onFocus={() => setFocused(i)}
                onBlur={() => setFocused((f) => (f === i ? null : f))}
                maxLength={100}
                autoComplete="off"
                aria-label={`속성 ${i + 1}`}
                placeholder={hints[i] ?? "속성"}
                className={`w-36 rounded-lg border px-3 py-2 text-base sm:text-sm outline-none focus:border-primary focus:border-solid ${
                  v.trim() ? "border-border bg-tile-blue/40" : "border-dashed border-border bg-transparent"
                }`}
              />
              {i >= MIN_LEVEL_SLOTS && (
                <button
                  type="button"
                  onClick={() => onChange(slots.filter((_, k) => k !== i))}
                  aria-label={`${i + 1}번 지우기`}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-surface border border-border text-text-muted hover:text-text p-0.5"
                >
                  <X size={11} />
                </button>
              )}
              {focused === i && (
                <ul role="listbox" aria-label={`이전에 쓴 속성 ${i + 1}`} className="absolute left-0 top-full mt-1 z-20 min-w-full w-max max-w-64 max-h-48 overflow-auto rounded-lg border border-border bg-surface shadow-lg p-1">
                  <li className="px-2 py-1 text-[10px] text-text-muted" aria-hidden>
                    이전에 쓴 속성
                  </li>
                  {list.length === 0 && (
                    <li className="px-2 py-1.5 text-xs text-text-muted">{(history[i] ?? []).length === 0 ? "아직 없습니다. 새로 입력하면 다음부터 나열됩니다." : "맞는 속성이 없습니다."}</li>
                  )}
                  {list.map((x) => (
                    <li key={x} role="option" aria-selected={false}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()} // 칸의 포커스를 잃지 않고 값만 넣는다
                        onClick={() => {
                          set(i, x);
                          setFocused(null);
                        }}
                        className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-bg"
                      >
                        {x}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </span>
          </span>
        );
      })}
      {slots.length < MAX_LEVEL_SLOTS && (
        <button type="button" onClick={() => onChange([...slots, ""])} className="flex items-center gap-1 rounded-lg border border-dashed border-border text-sm text-text-muted px-3 py-2 hover:text-primary">
          <Plus size={13} /> 추가
        </button>
      )}
    </div>
  );
}

/** 속성을 순서대로 가로로 이어 보여 주는 읽기 전용 표시 (상세 화면): `MCU › ARM Cortex-M3 › LQFP48`. 비어 있으면 안내 글. */
export function SubLevelView({ levels }: { levels: string[] }) {
  if (levels.length === 0) return <p className="text-xs text-text-muted">적어 둔 속성이 없습니다.</p>;
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="속성 순서">
      {levels.map((v, i) => (
        <li key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden className="text-text-muted/60">
              ›
            </span>
          )}
          <span className="rounded-lg border border-border bg-tile-blue/40 px-3 py-1.5 text-sm font-medium">{v}</span>
        </li>
      ))}
    </ol>
  );
}
