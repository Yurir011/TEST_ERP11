import { Paperclip, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { MAX_ATTACHMENT_BYTES, MAX_BODY_LENGTH, formatBytes } from "./messengerState";

// 확장자 제한 없이 모든 파일을 보낼 수 있다 (서버가 확인되지 않은 파일은 내려받기 전용으로만 저장한다).

const PASTE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** 보낼 파일 한 개. 이미지는 작은 미리보기 그림을 보여 주고, 누르면 크게 볼 수 있다. */
function StagedFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = PASTE_IMAGE_TYPES.has(file.type);
  const url = useMemo(() => (isImage ? URL.createObjectURL(file) : null), [file, isImage]);
  const [enlarged, setEnlarged] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setEnlarged(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enlarged]);

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-bg py-1.5 pl-1.5 pr-1.5 text-sm">
      {url ? (
        <button type="button" onClick={() => setEnlarged(true)} aria-label={`${file.name} 크게 보기`} title="누르면 크게 봅니다" className="shrink-0 overflow-hidden rounded-md">
          <img src={url} alt={file.name} className="h-14 w-14 object-cover" />
        </button>
      ) : (
        <Paperclip size={14} className="ml-1.5 shrink-0 text-text-muted" />
      )}
      <span className="truncate" title={file.name}>
        {file.name}
      </span>
      <span className="shrink-0 text-xs text-text-muted">{formatBytes(file.size)}</span>
      <button type="button" aria-label="보낼 파일 빼기" title="파일 빼기" onClick={onRemove} className="shrink-0 rounded p-1 text-text-muted hover:bg-border hover:text-text">
        <X size={13} />
      </button>
      {enlarged && url && (
        <div role="dialog" aria-label="이미지 미리보기" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setEnlarged(false)}>
          <img src={url} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}

/**
 * 메시지 입력칸. Enter 로 보내고 Shift+Enter 로 줄바꿈한다. 한글 조합(IME) 중의 Enter 는 보내지 않는다 (마지막 글자가 중복되거나 잘리는 것을 막는다).
 * 파일을 고르면 바로 보내지 않고 입력칸 위에 "보낼 파일"로 올려 두며, [보내기]나 Enter 를 눌러야 전송된다(입력한 글은 파일의 설명으로 함께 간다).
 * <form> 을 쓰지 않는다: 앱 전체의 "Enter = 다음 칸 이동" 규칙(enterAsTab)과 부딪히지 않게 하기 위해서다.
 */
export function MessageInput({
  onSend,
  onAttach,
  disabled = false,
  droppedFiles = null,
}: {
  onSend: (text: string) => void;
  /** 올려 둔 파일과 (있으면) 함께 쓴 글을 보낸다 */
  onAttach: (file: File, caption: string) => void;
  disabled?: boolean;
  /** 채팅창에 끌어다 놓은 파일들 (id 가 바뀔 때마다 새로 올린다) */
  droppedFiles?: { files: File[]; id: number } | null;
}) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** 파일들을 "보낼 파일"에 더한다. 크기 제한을 넘는 파일은 빼고 이유를 보여 준다. */
  function pickFiles(files: File[]) {
    const tooBig = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const ok = files.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    setFileError(
      tooBig.length
        ? `파일 크기는 ${formatBytes(MAX_ATTACHMENT_BYTES)}를 넘을 수 없습니다. (${tooBig.map((f) => `${f.name}: ${formatBytes(f.size)}`).join(", ")})`
        : null,
    );
    if (ok.length) setStaged((prev) => [...prev, ...ok]);
  }

  useEffect(() => {
    if (droppedFiles && !disabled) pickFiles(droppedFiles.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 끌어다 놓을 때(id 변경)만 실행
  }, [droppedFiles?.id]);

  function submit() {
    if (disabled) return;
    const body = text.trim();
    if (staged.length) {
      // 입력한 글은 첫 번째 파일의 설명으로만 보낸다
      staged.forEach((f, i) => onAttach(f, i === 0 ? body : ""));
      setStaged([]);
      setText("");
      return;
    }
    if (!body) return;
    onSend(body);
    setText("");
  }

  /** 클립보드의 이미지(캡처 등)를 Ctrl+V 로 붙여 넣으면 파일 첨부와 같이 "보낼 파일"로 올린다. 글자만 있는 붙여넣기는 그대로 둔다. */
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const image = Array.from(e.clipboardData.files).find((f) => PASTE_IMAGE_TYPES.has(f.type));
    if (!image || disabled) return;
    e.preventDefault();
    const ext = image.type === "image/jpeg" ? "jpg" : image.type.slice("image/".length);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    console.debug(`[Messenger] 클립보드 이미지 붙여넣기: ${image.type}, ${image.size}B`);
    pickFiles([new File([image], `붙여넣은 이미지_${stamp}.${ext}`, { type: image.type })]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  }

  return (
    <div className="border-t border-border bg-surface">
      {(staged.length > 0 || fileError) && (
        <div className="px-3 pt-3">
          {staged.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="보낼 파일">
              {staged.map((f, idx) => (
                <StagedFile key={`${f.name}-${idx}`} file={f} onRemove={() => setStaged((prev) => prev.filter((_, i) => i !== idx))} />
              ))}
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
          title="파일 첨부 (100MB까지)"
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
          multiple
          hidden
          aria-label="첨부할 파일"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = ""; // 같은 파일을 다시 골라도 동작하게
            if (files.length) pickFiles(files);
          }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          maxLength={MAX_BODY_LENGTH}
          placeholder={staged.length ? "파일과 함께 보낼 글 (선택)" : "메시지를 입력하세요 (Enter 보내기, Shift+Enter 줄바꿈)"}
          aria-label="메시지 입력"
          disabled={disabled}
          className="flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary max-h-32 min-h-[42px] disabled:opacity-60"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || (!text.trim() && !staged.length)}
          aria-label="보내기"
          className="p-2.5 rounded-lg bg-[#ffd43b] text-[#3b2f00] hover:bg-[#f5c800] disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
