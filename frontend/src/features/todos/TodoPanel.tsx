import "@fontsource/gaegu/400.css";
import "@fontsource/gaegu/700.css";
import { Check, Palette, Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { Todo } from "./types";

// 포스트잇(줄 쳐진 노란 메모지) 스타일. 글씨 색은 사용자가 고르고 이 브라우저에 기억한다.
const INK_STORAGE_KEY = "todo_ink_color";
const DEFAULT_INK = "#3B3A33";
const INK_COLORS: { value: string; label: string }[] = [
  { value: "#3B3A33", label: "먹색" },
  { value: "#1E4FD8", label: "파랑" },
  { value: "#C62828", label: "빨강" },
  { value: "#2E7D32", label: "초록" },
  { value: "#6A3FB5", label: "보라" },
  { value: "#7A4A1E", label: "갈색" },
];
const HAND_FONT = '"Gaegu", "Malgun Gothic", cursive';
const LINE = 26; // 줄 간격(px). 글자 줄 높이와 가로줄 간격을 같게 맞춘다.

function loadInk(): string {
  try {
    return localStorage.getItem(INK_STORAGE_KEY) || DEFAULT_INK;
  } catch {
    return DEFAULT_INK;
  }
}

export function TodoPanel() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [content, setContent] = useState("");
  const [ink, setInk] = useState<string>(loadInk);
  const [showPalette, setShowPalette] = useState(false);

  function changeInk(color: string) {
    logDebug("Todos", `글씨 색 변경: ${color}`);
    setInk(color);
    try {
      localStorage.setItem(INK_STORAGE_KEY, color);
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
      style={{ background: "#FFF6B8", color: ink, fontFamily: HAND_FONT }}
    >
      <div
        className="h-[22px] shrink-0 border-b border-dashed"
        style={{ background: "linear-gradient(180deg, #F2E48B, #FFF6B8)", borderColor: "rgba(139,122,37,0.35)" }}
      />

      <div className="flex items-center justify-between pl-[30px] pr-3 h-10 shrink-0">
        <p className="text-[19px] font-bold leading-10">오늘의 할일 {todos && `(${doneCount}/${totalCount})`}</p>
        <button
          type="button"
          onClick={() => setShowPalette((v) => !v)}
          title="글씨 색 설정"
          aria-label="글씨 색 설정"
          aria-expanded={showPalette}
          className="p-1 rounded-md hover:bg-black/10 shrink-0"
        >
          <Palette size={14} />
        </button>
      </div>

      {showPalette && (
        <div className="flex items-center gap-1.5 pl-[30px] pr-3 pb-2 shrink-0 flex-wrap" role="radiogroup" aria-label="글씨 색">
          {INK_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={ink === c.value}
              aria-label={c.label}
              title={c.label}
              onClick={() => changeInk(c.value)}
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
              onChange={(e) => changeInk(e.target.value)}
              aria-label="글씨 색 직접 선택"
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
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
        {todos?.length === 0 && <p className="text-[17px]" style={{ lineHeight: `${LINE}px` }}>할 일이 없습니다.</p>}
        {todos?.map((todo) => (
          <div key={todo.id} className="flex items-start gap-2 group" style={{ minHeight: LINE }}>
            <button
              onClick={() => handleToggle(todo)}
              aria-label={todo.is_done ? "완료 취소" : "완료"}
              className="w-4 h-4 mt-[5px] rounded-full border-[1.5px] flex items-center justify-center shrink-0"
              style={{ borderColor: ink, background: todo.is_done ? ink : "transparent", color: "#FFF6B8" }}
            >
              {todo.is_done && <Check size={10} strokeWidth={3.5} />}
            </button>
            <span
              className={`flex-1 min-w-0 text-[17px] break-words ${todo.is_done ? "line-through opacity-55" : ""}`}
              style={{ lineHeight: `${LINE}px` }}
            >
              {todo.content}
            </span>
            <button
              onClick={() => handleDelete(todo.id)}
              aria-label="삭제"
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0 mt-[5px]"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-1.5 pl-[30px] pr-3 py-2.5 shrink-0">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="할 일 추가"
          className="flex-1 min-w-0 text-[15px] rounded-lg border px-2.5 py-1 outline-none bg-white/60 placeholder:opacity-60 focus:bg-white/80"
          style={{ borderColor: "rgba(122,106,32,0.4)", color: ink, fontFamily: HAND_FONT }}
        />
        <button type="submit" aria-label="추가" className="p-1.5 rounded-lg text-white shrink-0" style={{ background: "#7A6A20" }}>
          <Plus size={12} />
        </button>
      </form>
    </div>
  );
}
