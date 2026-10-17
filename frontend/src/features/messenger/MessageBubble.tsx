import { FileText, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, downloadFile, openFile } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { logError } from "../../lib/logger";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { splitLinks } from "./linkify";
import { formatBytes, isImage, isInlineViewable, timeLabel } from "./messengerState";
import type { Attachment, ChatMessage, PendingMessage } from "./types";

const attachmentPath = (a: Attachment) => `/api/messenger/attachments/${a.id}`;

/** 글 안의 http(s) 주소를 링크로 그린다 (요소로 만들므로 글 안의 HTML 이 실행되지 않는다). 줄바꿈은 그대로 유지. */
export function MessageText({ text }: { text: string }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {splitLinks(text).map((p, i) =>
        p.type === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            {p.value}
          </a>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </span>
  );
}

/** 인증이 필요한 이미지를 받아 작은 그림으로 보여 주고, 누르면 새 창에서 원본을 연다. */
function ImageAttachment({ a }: { a: Attachment }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const dialog = useDialog();

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    const token = getToken();
    fetch(attachmentPath(a), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch((err) => {
        logError("Messenger", `이미지 불러오기 실패: attachment_id=${a.id}`, err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [a]);

  if (failed) return <div className="text-xs opacity-70 py-2">이미지를 불러오지 못했습니다 ({a.file_name})</div>;
  if (!src) return <div className="h-32 w-48 rounded-lg bg-black/10 animate-pulse" />;
  return (
    <button
      type="button"
      title={`${a.file_name} (${formatBytes(a.size)})`}
      onClick={() => void openFile(attachmentPath(a)).catch((err) => dialog.notifyError(err instanceof ApiError ? err.message : "파일을 열지 못했습니다."))}
      className="block"
    >
      <img src={src} alt={a.file_name} className="max-h-60 max-w-full rounded-lg object-contain" />
    </button>
  );
}

function FileAttachment({ a }: { a: Attachment }) {
  const dialog = useDialog();
  const viewable = isInlineViewable(a.content_type);
  async function open() {
    try {
      if (viewable) await openFile(attachmentPath(a)); // PDF 는 새 창에서 바로 본다
      else await downloadFile(attachmentPath(a), a.file_name);
    } catch (err) {
      dialog.notifyError(err instanceof ApiError ? err.message : "파일을 열지 못했습니다.");
    }
  }
  return (
    <button type="button" onClick={open} className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-left max-w-full hover:bg-black/15" title={viewable ? "열기" : "다운로드"}>
      <FileText size={18} className="shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm truncate">{a.file_name}</span>
        <span className="block text-[11px] opacity-70">{formatBytes(a.size)} · {viewable ? "열기" : "다운로드"}</span>
      </span>
    </button>
  );
}

interface BubbleProps {
  message: ChatMessage;
  mine: boolean;
  showSender: boolean;
  showTime: boolean;
  readLabel: string | null;
}

export function MessageBubble({ message, mine, showSender, showTime, readLabel }: BubbleProps) {
  const time = <span className="text-[11px] text-text-muted shrink-0 self-end pb-0.5">{showTime ? timeLabel(message.created_at) : ""}</span>;
  const read = readLabel ? <span className="text-[11px] text-primary shrink-0 self-end pb-0.5">{readLabel}</span> : null;
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {showSender && <span className="text-xs text-text-muted mb-1 px-1">{message.sender_name ?? "(알 수 없음)"}</span>}
      <div className={`flex gap-1.5 max-w-[75%] ${mine ? "flex-row-reverse" : ""}`}>
        <div className={`min-w-0 rounded-2xl px-3.5 py-2 text-sm space-y-2 ${mine ? "bg-primary text-white rounded-tr-md" : "bg-bg border border-border rounded-tl-md"}`}>
          {message.attachments.map((a) => (isImage(a.content_type) && isInlineViewable(a.content_type) ? <ImageAttachment key={a.id} a={a} /> : <FileAttachment key={a.id} a={a} />))}
          {message.body && <MessageText text={message.body} />}
        </div>
        <div className={`flex flex-col justify-end ${mine ? "items-end" : "items-start"}`}>
          {read}
          {time}
        </div>
      </div>
    </div>
  );
}

/** 아직 서버에 저장되지 않은(보내는 중이거나 실패한) 내 메시지 */
export function PendingBubble({ p, onRetry, onDiscard }: { p: PendingMessage; onRetry: () => void; onDiscard: () => void }) {
  return (
    <div className="flex flex-col items-end">
      <div className={`max-w-[75%] rounded-2xl rounded-tr-md px-3.5 py-2 text-sm ${p.failed ? "bg-danger/10 border border-danger/40" : "bg-primary/60 text-white"}`}>
        {p.fileName && (
          <div className="flex items-center gap-1.5 mb-1 text-xs opacity-90">
            <Paperclip size={13} />
            <span className="truncate">{p.fileName}</span>
          </div>
        )}
        {p.body && <MessageText text={p.body} />}
      </div>
      {p.failed ? (
        <div className="flex items-center gap-2 mt-1 text-[11px] text-danger" role="alert">
          <span>{p.error ?? "보내지 못했습니다."}</span>
          <button type="button" onClick={onRetry} className="underline">
            다시 보내기
          </button>
          <button type="button" onClick={onDiscard} className="underline text-text-muted">
            삭제
          </button>
        </div>
      ) : (
        <span className="text-[11px] text-text-muted mt-1">보내는 중...</span>
      )}
    </div>
  );
}
