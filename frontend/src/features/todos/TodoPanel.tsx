import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logError } from "../../lib/logger";
import type { Todo } from "./types";

export function TodoPanel() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [content, setContent] = useState("");

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
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col border-t border-border border-l-[3px] border-l-primary bg-surface">
      <div className="pl-3 pr-4 pt-3 pb-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-text">오늘의 할일</p>
          <span className="text-[9px] font-bold tracking-wide text-tile-blue-fg bg-tile-blue rounded px-1.5 py-0.5 uppercase">
            Today
          </span>
        </div>
        <div className="h-1 rounded-full bg-border overflow-hidden mt-2">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="pl-3 pr-4 flex-1 min-h-0 flex flex-col">
        <form onSubmit={handleAdd} className="flex items-center gap-1.5 mb-2 shrink-0">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="할 일 추가"
            className="flex-1 text-xs rounded-lg border border-border px-2.5 py-1.5 outline-none focus:border-primary bg-surface"
          />
          <button type="submit" className="p-1.5 rounded-lg bg-primary text-white shrink-0">
            <Plus size={12} />
          </button>
        </form>

        <ul className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pb-3">
          {todos?.length === 0 && <li className="text-xs text-text-muted px-2 py-2">할 일이 없습니다.</li>}
          {todos?.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-bg hover:bg-border/50 transition-colors group"
            >
              <button
                onClick={() => handleToggle(todo)}
                className={`w-4 h-4 rounded-[5px] border-[1.5px] flex items-center justify-center shrink-0 ${
                  todo.is_done ? "bg-primary border-primary text-white" : "border-border"
                }`}
              >
                {todo.is_done && <span className="text-[9px] leading-none">✓</span>}
              </button>
              <span className={`flex-1 text-xs break-words ${todo.is_done ? "line-through text-text-muted" : ""}`}>
                {todo.content}
              </span>
              <button
                onClick={() => handleDelete(todo.id)}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
