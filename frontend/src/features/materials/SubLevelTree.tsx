import { Plus, X } from "lucide-react";
import { MAX_LEVEL_SLOTS, MIN_LEVEL_SLOTS } from "./types";

const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-base sm:text-sm outline-none focus:border-primary bg-surface";

/**
 * 속성 입력: `큰 분류 › 세부 분류 › 더 세부` 처럼 한 줄로 이어 쓰는 칸들. 비워 둔 칸은 저장하지 않는다.
 * 기본 3칸을 보여 주고 [+ 추가]로 최대 10단계까지 늘린다 (기본 3칸을 넘어선 칸은 ×로 지울 수 있다).
 * @param levels 지금 입력된 칸들 (빈 칸 포함)
 * @param onChange 칸이 바뀔 때 새 목록
 */
export function SubLevelEditor({ levels, onChange }: { levels: string[]; onChange: (next: string[]) => void }) {
  const slots = levels.length >= MIN_LEVEL_SLOTS ? levels : [...levels, ...Array(MIN_LEVEL_SLOTS - levels.length).fill("")];
  const hints = ["큰 분류", "세부 분류", "더 세부"];

  function set(i: number, v: string) {
    const next = [...slots];
    next[i] = v;
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {slots.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden className="text-text-muted/60">
              ›
            </span>
          )}
          <span className="relative">
            <input
              value={v}
              onChange={(e) => set(i, e.target.value)}
              maxLength={100}
              aria-label={`속성 ${i + 1}단계`}
              placeholder={hints[i] ?? "더 세부"}
              className={`w-32 rounded-lg border px-3 py-2 text-base sm:text-sm outline-none focus:border-primary focus:border-solid ${
                v.trim() ? "border-border bg-tile-blue/40" : "border-dashed border-border bg-transparent"
              }`}
            />
            {i >= MIN_LEVEL_SLOTS && (
              <button
                type="button"
                onClick={() => onChange(slots.filter((_, k) => k !== i))}
                aria-label={`${i + 1}단계 지우기`}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-surface border border-border text-text-muted hover:text-text p-0.5"
              >
                <X size={11} />
              </button>
            )}
          </span>
        </span>
      ))}
      {slots.length < MAX_LEVEL_SLOTS && (
        <button type="button" onClick={() => onChange([...slots, ""])} className="flex items-center gap-1 text-sm text-primary px-1 py-1.5">
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
