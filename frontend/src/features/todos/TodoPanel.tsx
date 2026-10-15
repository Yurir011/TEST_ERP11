import "@fontsource/gaegu/400.css";
import "@fontsource/gaegu/700.css";
import "@fontsource/nanum-pen-script/korean-400.css";
import "@fontsource/nanum-pen-script/latin-400.css";
import "@fontsource/poor-story/korean-400.css";
import "@fontsource/poor-story/latin-400.css";
import { Check, Minus, Plus, Type, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { Todo } from "./types";

// 포스트잇(줄 쳐진 노란 메모지) 스타일. 글씨체/크기/진하기/색은 사용자가 고르고 이 브라우저에 기억한다.
const STYLE_STORAGE_KEY = "todo_style";
const OLD_INK_STORAGE_KEY = "todo_ink_color"; // 예전 버전(색만 저장)과의 호환용
const INK_COLORS: { value: string; label: string }[] = [
  { value: "#3B3A33", label: "먹색" },
  { value: "#1E4FD8", label: "파랑" },
  { value: "#C62828", label: "빨강" },
  { value: "#2E7D32", label: "초록" },
  { value: "#6A3FB5", label: "보라" },
  { value: "#7A4A1E", label: "갈색" },
];
const FONTS = [
  { id: "gaegu", label: "개구", css: '"Gaegu", "Malgun Gothic", cursive', size: 17 },
  { id: "pen", label: "나눔손글씨 펜", css: '"Nanum Pen Script", "Malgun Gothic", cursive', size: 21 },
  { id: "story", label: "푸어스토리", css: '"Poor Story", "Malgun Gothic", cursive', size: 16 },
] as const;
type FontId = (typeof FONTS)[number]["id"];
const WEIGHT_LABELS = ["보통", "진하게", "아주 진하게"];
const MIN_SIZE = 14;
const MAX_SIZE = 24;
const LINE = 26; // 줄 간격(px). 글자 줄 높이와 가로줄 간격을 같게 맞춘다.

interface TodoStyle {
  font: FontId;
  size: number;
  weight: 0 | 1 | 2; // 0 보통 / 1 진하게 / 2 아주 진하게
  ink: string;
}
const DEFAULT_STYLE: TodoStyle = { font: "gaegu", size: 17, weight: 0, ink: "#3B3A33" };

function fontOf(id: FontId) {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

function loadStyle(): TodoStyle {
  try {
    const raw = localStorage.getItem(STYLE_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<TodoStyle>;
      return {
        font: FONTS.some((f) => f.id === p.font) ? (p.font as FontId) : DEFAULT_STYLE.font,
        size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number(p.size) || DEFAULT_STYLE.size)),
        weight: p.weight === 1 || p.weight === 2 ? p.weight : 0,
        ink: typeof p.ink === "string" && p.ink ? p.ink : DEFAULT_STYLE.ink,
      };
    }
    const oldInk = localStorage.getItem(OLD_INK_STORAGE_KEY);
    if (oldInk) return { ...DEFAULT_STYLE, ink: oldInk };
  } catch {
    // 읽기 실패 시 기본값 사용
  }
  return DEFAULT_STYLE;
}

export function TodoPanel() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [content, setContent] = useState("");
  const [style, setStyle] = useState<TodoStyle>(loadStyle);
  const [showSettings, setShowSettings] = useState(false);
  const [colorEditId, setColorEditId] = useState<number | null>(null); // 글씨 색을 고르는 중인 메모
  const { ink, size } = style;
  const fontCss = fontOf(style.font).css;

  function changeStyle(patch: Partial<TodoStyle>) {
    const next = { ...style, ...patch };
    logDebug("Todos", `글씨 설정 변경: ${JSON.stringify(patch)}`);
    setStyle(next);
    try {
      localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 저장 실패는 무시한다 (이번 화면에서만 적용될 뿐 동작에는 영향 없음)
    }
  }

  function loadTodos() {
    apiGet<Todo[]>("/api/todos")
      .then(setTodos)
      .catch((err) => logError("Todos", "조회 실패", err));
  }

  useEffect(() => {
    loadTodos();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await apiPost("/api/todos", { content: content.trim() });
      setContent("");
      loadTodos();
    } catch (err) {
      logError("Todos", "추가 실패", err);
    }
  }

  async function handleToggle(todo: Todo) {
    try {
      await apiPut(`/api/todos/${todo.id}/toggle`);
      loadTodos();
    } catch (err) {
      logError("Todos", "토글 실패", err);
    }
  }

  async function handleColor(todo: Todo, color: string | null, keepOpen = false) {
    logDebug("Todos", `메모 글씨 색 변경: id=${todo.id}, color=${color}`);
    try {
      await apiPut(`/api/todos/${todo.id}/color`, { color });
      if (!keepOpen) setColorEditId(null); // 색을 고르면 팔레트를 바로 닫는다
      loadTodos();
    } catch (err) {
      logError("Todos", "메모 글씨 색 변경 실패", err);
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiDelete(`/api/todos/${id}`);
      loadTodos();
    } catch (err) {
      logError("Todos", "삭제 실패", err);
    }
  }

  const doneCount = todos?.filter((t) => t.is_done).length ?? 0;
  const totalCount = todos?.length ?? 0;

  return (
    <div
      className="mx-3 mb-3 flex-1 min-h-0 flex flex-col overflow-hidden shadow-[0_8px_12px_-8px_rgba(60,50,0,0.35),0_1px_1px_rgba(60,50,0,0.2)]"
      style={{
        background: "#FFF6B8",
        color: ink,
        fontFamily: fontCss,
        fontWeight: style.weight >= 1 ? 700 : 400,
        WebkitTextStroke: style.weight === 2 ? `0.5px ${ink}` : undefined,
      }}
    >
      <div
        className="h-[22px] shrink-0 border-b border-dashed"
        style={{ background: "linear-gradient(180deg, #F2E48B, #FFF6B8)", borderColor: "rgba(139,122,37,0.35)" }}
      />

      <div className="flex items-center justify-between pl-[30px] pr-3 h-10 shrink-0">
        <p className="font-bold leading-10" style={{ fontSize: size + 2 }}>Memo {todos && `(${doneCount}/${totalCount})`}</p>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          title="글씨 설정"
          aria-label="글씨 설정"
          aria-expanded={showSettings}
          className="p-1 rounded-md hover:bg-black/10 shrink-0"
        >
          <Type size={14} />
        </button>
      </div>

      {showSettings && (
        <div className="pl-[30px] pr-3 pb-2 shrink-0 flex flex-col gap-2 text-[13px]" aria-label="글씨 설정">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="글씨체">
            {FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={style.font === f.id}
                onClick={() => changeStyle({ font: f.id, size: f.size })}
                className={`px-2 py-0.5 rounded-md border ${style.font === f.id ? "bg-black/15 border-black/40" : "border-black/15 hover:bg-black/10"}`}
                style={{ fontFamily: f.css }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="글자 작게"
              disabled={size <= MIN_SIZE}
              onClick={() => changeStyle({ size: size - 1 })}
              className="p-1 rounded-md border border-black/15 hover:bg-black/10 disabled:opacity-40"
            >
              <Minus size={12} />
            </button>
            <span className="min-w-[38px] text-center tabular-nums">{size}px</span>
            <button
              type="button"
              aria-label="글자 크게"
              disabled={size >= MAX_SIZE}
              onClick={() => changeStyle({ size: size + 1 })}
              className="p-1 rounded-md border border-black/15 hover:bg-black/10 disabled:opacity-40"
            >
              <Plus size={12} />
            </button>
            <div className="flex gap-1 ml-1" role="radiogroup" aria-label="진하기">
              {WEIGHT_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={style.weight === i}
                  onClick={() => changeStyle({ weight: i as 0 | 1 | 2 })}
                  className={`px-1.5 py-0.5 rounded-md border text-[12px] ${style.weight === i ? "bg-black/15 border-black/40" : "border-black/15 hover:bg-black/10"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="글씨 색">
            {INK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={ink === c.value}
                aria-label={c.label}
                title={c.label}
                onClick={() => changeStyle({ ink: c.value })}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-white ${
                  ink === c.value ? "ring-2 ring-offset-1 ring-offset-[#FFF6B8] ring-black/40" : ""
                }`}
                style={{ background: c.value }}
              >
                {ink === c.value && <Check size={11} strokeWidth={3} />}
              </button>
            ))}
            <label
              title="직접 선택"
              className="w-5 h-5 rounded-full border border-dashed border-black/40 flex items-center justify-center overflow-hidden cursor-pointer relative"
            >
              <span className="text-[11px] leading-none">+</span>
              <input
                type="color"
                value={ink}
                onChange={(e) => changeStyle({ ink: e.target.value })}
                aria-label="글씨 색 직접 선택"
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* 가로줄은 내용과 함께 스크롤되도록 background-attachment: local 로 깐다. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto pl-[30px] pr-3"
        style={{
          backgroundImage: `linear-gradient(90deg, transparent 20px, rgba(220,80,80,0.45) 20px, rgba(220,80,80,0.45) 21px, transparent 21px), repeating-linear-gradient(180deg, transparent 0 ${LINE - 1}px, rgba(90,130,200,0.35) ${LINE - 1}px ${LINE}px)`,
          backgroundAttachment: "local",
          marginLeft: 0,
        }}
      >
        {/* 맨 윗줄은 비워 두고 둘째 줄부터 기록되게 한다. */}
        <div aria-hidden style={{ height: LINE }} />
        {todos?.length === 0 && <p style={{ fontSize: size, lineHeight: `${LINE}px` }}>메모가 없습니다.</p>}
        {todos?.map((todo) => {
          const rowInk = todo.color ?? ink;
          return (
            <div key={todo.id}>
              <div className="flex items-start gap-2 group" style={{ minHeight: LINE, color: rowInk }}>
                <button
                  onClick={() => handleToggle(todo)}
                  aria-label={todo.is_done ? "완료 취소" : "완료"}
                  className="w-4 h-4 mt-[5px] rounded-full border-[1.5px] flex items-center justify-center shrink-0"
                  style={{ borderColor: rowInk, background: todo.is_done ? rowInk : "transparent", color: "#FFF6B8" }}
                >
                  {todo.is_done && <Check size={10} strokeWidth={3.5} />}
                </button>
                <span
                  className={`flex-1 min-w-0 break-words ${todo.is_done ? "line-through opacity-55" : ""}`}
                  style={{
                    fontSize: size,
                    lineHeight: `${LINE}px`,
                    WebkitTextStroke: style.weight === 2 ? `0.5px ${rowInk}` : undefined,
                  }}
                >
                  {todo.content}
                </span>
                <button
                  onClick={() => setColorEditId((cur) => (cur === todo.id ? null : todo.id))}
                  aria-label="메모 글씨 색"
                  aria-expanded={colorEditId === todo.id}
                  title="이 메모 글씨 색"
                  className={`shrink-0 mt-[6px] w-3.5 h-3.5 rounded-full border border-black/30 ${
                    colorEditId === todo.id ? "" : "opacity-0 group-hover:opacity-80"
                  } hover:!opacity-100`}
                  style={{ background: rowInk }}
                />
                <button
                  onClick={() => handleDelete(todo.id)}
                  aria-label="삭제"
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0 mt-[5px]"
                >
                  <X size={13} />
                </button>
              </div>
              {colorEditId === todo.id && (
                <div className="flex items-center gap-1.5 flex-wrap pl-6" style={{ minHeight: LINE }} role="radiogroup" aria-label="메모 글씨 색">
                  {INK_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={rowInk === c.value}
                      aria-label={c.label}
                      title={c.label}
                      onClick={() => handleColor(todo, c.value)}
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-white ${
                        rowInk === c.value ? "ring-2 ring-offset-1 ring-offset-[#FFF6B8] ring-black/40" : ""
                      }`}
                      style={{ background: c.value }}
                    >
                      {rowInk === c.value && <Check size={9} strokeWidth={3} />}
                    </button>
                  ))}
                  <label
                    title="직접 선택"
                    className="w-4 h-4 rounded-full border border-dashed border-black/40 flex items-center justify-center overflow-hidden cursor-pointer relative"
                  >
                    <span className="text-[10px] leading-none">+</span>
                    <input
                      type="color"
                      value={rowInk}
                      onChange={(e) => handleColor(todo, e.target.value, true)} // 색상판을 움직이는 동안은 유지하고, 닫히면(blur) 팔레트도 닫는다
                      onBlur={() => setColorEditId(null)}
                      aria-label="메모 글씨 색 직접 선택"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </label>
                  {todo.color && (
                    <button type="button" onClick={() => handleColor(todo, null)} className="text-[12px] underline opacity-70 hover:opacity-100">
                      기본색
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-1.5 pl-[30px] pr-3 py-2.5 shrink-0">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="메모 추가"
          className="flex-1 min-w-0 text-[15px] rounded-lg border px-2.5 py-1 outline-none bg-white/60 placeholder:opacity-60 focus:bg-white/80"
          style={{ borderColor: "rgba(122,106,32,0.4)", color: ink, fontFamily: fontCss }}
        />
        <button type="submit" aria-label="추가" className="p-1.5 rounded-lg text-white shrink-0" style={{ background: "#7A6A20" }}>
          <Plus size={12} />
        </button>
      </form>
    </div>
  );
}
