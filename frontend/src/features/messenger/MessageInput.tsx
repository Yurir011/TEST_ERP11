import { Paperclip, Send } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { MAX_BODY_LENGTH } from "./messengerState";

// 서버가 받는 형식 (backend/app/services/upload_check.py 의 ATTACHMENT_TYPES). 최종 확인은 서버가 파일 내용으로 한다.
const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt";

/**
 * 메시지 입력칸. Enter 로 보내고 Shift+Enter 로 줄바꿈한다. 한글 조합(IME) 중의 Enter 는 보내지 않는다 (마지막 글자가 중복되거나 잘리는 것을 막는다).
 * <form> 을 쓰지 않는다: 앱 전체의 "Enter = 다음 칸 이동" 규칙(enterAsTab)과 부딪히지 않게 하기 위해서다.
 */
export function MessageInput({ onSend, onAttach, disabled = false }: { onSend: (text: string) => void; onAttach: (file: File) => void; disabled?: boolean }) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function submit() {
    const body = text.trim();
    if (!body || disabled) return;
    onSend(body);
    setText("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  }

  return (
    <div className="border-t border-border p-3 flex items-end gap-2 bg-surface">
      <button
        type="button"
        title="파일 첨부 (20MB까지)"
        aria-label="파일 첨부"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
        className="p-2.5 rounded-lg text-text-muted hover:bg-bg hover:text-text disabled:opacity-50"
      >
        <Paperclip size={18} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        hidden
        aria-label="첨부할 파일"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // 같은 파일을 다시 골라도 동작하게
          if (file) onAttach(file);
        }}
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        maxLength={MAX_BODY_LENGTH}
        placeholder="메시지를 입력하세요 (Enter 보내기, Shift+Enter 줄바꿈)"
        aria-label="메시지 입력"
        disabled={disabled}
        className="flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary max-h-32 min-h-[42px] disabled:opacity-60"
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !text.trim()}
        aria-label="보내기"
        className="p-2.5 rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
      >
        <Send size={18} />
      </button>
    </div>
  );
}
