import { Plus, X } from "lucide-react";
import { MAX_LEVEL_SLOTS, MIN_LEVEL_SLOTS } from "./types";

const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-base sm:text-sm outline-none focus:border-primary bg-surface";

/** 트리 한 단계의 줄 모양 (왼쪽 연결선). 안쪽으로 들어가는 간격은 부르는 쪽에서 준다. */
function Branch({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative pl-5">
      <span aria-hidden className="absolute left-1 -top-3 h-[calc(50%+12px)] w-3 rounded-bl-lg border-b-2 border-l-2 border-border" />
      {children}
    </div>
  );
}

/**
 * 하위 속성 입력(트리 위젯). 1단계 → 2단계 → 3단계 … 로 안쪽으로 들어가는 칸이며 비워 둔 칸은 저장하지 않는다.
 * 기본 3칸을 보여 주고 [+ 하위 단계 더 추가] 로 늘린다.
 * @param levels 지금 입력된 칸들 (빈 칸 포함)
 * @param onChange 칸이 바뀔 때 새 목록
 * @param rootLabel 맨 위에 보이는 이름 (항목 + 이름)
 */
export function SubLevelEditor({ levels, onChange, rootLabel }: { levels: string[]; onChange: (next: string[]) => void; rootLabel: string }) {
  const slots = levels.length >= MIN_LEVEL_SLOTS ? levels : [...levels, ...Array(MIN_LEVEL_SLOTS - levels.length).fill("")];

  function set(i: number, v: string) {
    const next = [...slots];
    next[i] = v;
    onChange(next);
  }

  return (
    <div className="rounded-xl border border-border bg-bg p-3.5">
      <p className="text-sm font-semibold truncate mb-1">{rootLabel}</p>
      {slots.map((v, i) => (
        <div key={i} className="mt-2" style={{ marginLeft: i * 22 }}>
          <Branch>
            <div className="flex items-center gap-2">
              <input
                value={v}
                onChange={(e) => set(i, e.target.value)}
                maxLength={100}
                aria-label={`하위 속성 ${i + 1}단계`}
                placeholder="비워 두면 건너뜁니다"
                className={inputCls}
              />
              {i >= MIN_LEVEL_SLOTS && (
                <button type="button" onClick={() => onChange(slots.filter((_, k) => k !== i))} aria-label={`${i + 1}단계 지우기`} className="text-text-muted hover:text-text">
                  <X size={15} />
                </button>
              )}
            </div>
          </Branch>
        </div>
      ))}
      {slots.length < MAX_LEVEL_SLOTS && (
        <button type="button" onClick={() => onChange([...slots, ""])} className="mt-3 flex items-center gap-1 text-xs text-primary">
          <Plus size={13} /> 하위 단계 더 추가
        </button>
      )}
    </div>
  );
}

/** 하위 속성을 트리 모양으로 보여 주는 읽기 전용 표시 (상세 화면). 비어 있으면 안내 글. */
export function SubLevelView({ levels, rootLabel }: { levels: string[]; rootLabel: string }) {
  return (
    <div>
      <p className="text-sm font-semibold truncate">{rootLabel}</p>
      {levels.length === 0 ? (
        <p className="text-xs text-text-muted mt-1">적어 둔 하위 속성이 없습니다.</p>
      ) : (
        levels.map((v, i) => (
          <div key={i} className="mt-2" style={{ marginLeft: i * 22 }}>
            <Branch>
              <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{v}</span>
              </div>
            </Branch>
          </div>
        ))
      )}
    </div>
  );
}
