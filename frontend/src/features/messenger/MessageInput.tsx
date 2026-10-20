import { Paperclip, Send, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { MAX_ATTACHMENT_BYTES, MAX_BODY_LENGTH, formatBytes } from "./messengerState";

// 서버가 받는 형식 (backend/app/services/upload_check.py 의 ATTACHMENT_TYPES). 최종 확인은 서버가 파일 내용으로 한다.
const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt";

/**
 * 메시지 입력칸. Enter 로 보내고 Shift+Enter 로 줄바꿈한다. 한글 조합(IME) 중의 Enter 는 보내지 않는다 (마지막 글자가 중복되거나 잘리는 것을 막는다).
 * 파일을 고르면 바로 보내지 않고 입력칸 위에 "보낼 파일"로 올려 두며, [보내기]나 Enter 를 눌러야 전송된다(입력한 글은 파일의 설명으로 함께 간다).
 * <form> 을 쓰지 않는다: 앱 전체의 "Enter = 다음 칸 이동" 규칙(enterAsTab)과 부딪히지 않게 하기 위해서다.
 */
export function MessageInput({
  onSend,
  onAttach,
  disabled = false,
}: {
  onSend: (text: string) => void;
  /** 올려 둔 파일과 (있으면) 함께 쓴 글을 보낸다 */
  onAttach: (file: File, caption: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setFileError(`파일 크기는 ${formatBytes(MAX_ATTACHMENT_BYTES)}를 넘을 수 없습니다. (${file.name}: ${formatBytes(file.size)})`);
      return;
    }
    setFileError(null);
    setStaged(file);
  }

  function submit() {
    if (disabled) return;
    const body = text.trim();
    if (staged) {
      onAttach(staged, body);
      setStaged(null);
      setText("");
      return;
    }
    if (!body) return;
    onSend(body);
    setText("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  }

  return (
    <div className="border-t border-border bg-surface">
      {(staged || fileError) && (
        <div className="px-3 pt-3">
          {staged && (
            <div
              className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-bg pl-3 pr-1.5 py-1.5 text-sm"
              aria-label="보낼 파일"
            >
              <Paperclip size={14} className="shrink-0 text-text-muted" />
              <span className="truncate" title={staged.name}>
                {staged.name}
              </span>
              <span className="shrink-0 text-xs text-text-muted">{formatBytes(staged.size)}</span>
              <button
                type="button"
                aria-label="보낼 파일 빼기"
                title="파일 빼기"
                onClick={() => setStaged(null)}
                className="shrink-0 rounded p-1 text-text-muted hover:bg-border hover:text-text"
              >
                <X size={13} />
              </button>
            </div>
          )}
          {fileError && (
            <p role="alert" className="text-xs text-danger">
              {fileError}
            </p>
          )}
        </div>
      )}
      <div className="p-3 flex items-end gap-2">
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
            if (file) pickFile(file);
          }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={MAX_BODY_LENGTH}
          placeholder={staged ? "파일과 함께 보낼 글 (선택)" : "메시지를 입력하세요 (Enter 보내기, Shift+Enter 줄바꿈)"}
          aria-label="메시지 입력"
          disabled={disabled}
          className="flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary max-h-32 min-h-[42px] disabled:opacity-60"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || (!text.trim() && !staged)}
          aria-label="보내기"
          className="p-2.5 rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
