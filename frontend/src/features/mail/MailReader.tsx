import { ArrowLeft, Paperclip, Star } from "lucide-react";
import type { MailDetail } from "../../lib/desktop";
import { MailHtmlFrame } from "./MailHtmlFrame";
import { formatFileSize, formatMailDateTime, senderLabel, subjectLabel } from "./mailFormat";

interface Props {
  detail: MailDetail | null;
  loading: boolean;
  error: string | null;
  allowImages: boolean;
  onBack: () => void;
  onShowImages: () => void;
  onMarkUnread: () => void;
  onToggleStar: (on: boolean) => void;
  onAttachment: (kind: "open" | "save", index: number) => void;
  onCompose: (kind: "reply" | "replyAll" | "forward") => void;
}

/** 메일 읽기 화면: 목록으로 돌아가는 버튼 + 머리글 + 본문 */
export function MailReader({ detail, loading, error, allowImages, onBack, onShowImages, onMarkUnread, onToggleStar, onAttachment, onCompose }: Props) {
  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b border-border">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg">
          <ArrowLeft size={15} /> 목록
        </button>
        {detail && (
          <>
            <button type="button" onClick={() => onCompose("reply")} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-bg">답장</button>
            <button type="button" onClick={() => onCompose("replyAll")} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-bg">전체답장</button>
            <button type="button" onClick={() => onCompose("forward")} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-bg">전달</button>
            <button type="button" onClick={onMarkUnread} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg">안 읽음으로 표시</button>
            <button
              type="button"
              aria-pressed={detail.flagged}
              aria-label={detail.flagged ? "이 메일 중요 해제" : "이 메일 중요 표시"}
              onClick={() => onToggleStar(!detail.flagged)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg"
            >
              <Star size={15} fill={detail.flagged ? "currentColor" : "none"} className={detail.flagged ? "text-tile-orange-fg" : ""} />
              {detail.flagged ? "중요 해제" : "중요"}
            </button>
          </>
        )}
      </div>

      {loading && !detail ? (
        <p className="m-auto text-sm text-text-muted">메일을 불러오는 중...</p>
      ) : error ? (
        <p role="alert" className="m-auto text-sm text-danger px-6 text-center">{error}</p>
      ) : detail ? (
        <>
          <header className="px-6 py-4 border-b border-border space-y-1">
            <h2 className="text-lg font-semibold break-words">{subjectLabel(detail)}</h2>
            <p className="text-sm">
              <span className="font-medium">{senderLabel(detail)}</span>
              {detail.fromName && detail.fromAddr && <span className="text-text-muted"> &lt;{detail.fromAddr}&gt;</span>}
            </p>
            <p className="text-xs text-text-muted break-words">받는 사람: {detail.to || "-"}{detail.cc ? ` · 참조: ${detail.cc}` : ""}</p>
            <p className="text-xs text-text-muted">{formatMailDateTime(detail.date)}</p>
            {detail.attachments.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-2" aria-label="첨부 파일">
                {detail.attachments.map((a) => (
                  <li key={a.index} className="flex items-center gap-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs">
                    <Paperclip size={12} className="text-text-muted" />
                    <span className="max-w-[16rem] truncate" title={a.filename}>{a.filename}</span>
                    <span className="text-text-muted">({formatFileSize(a.size)})</span>
                    <button type="button" onClick={() => onAttachment("open", a.index)} className="ml-1 text-primary hover:underline">열기</button>
                    <button type="button" onClick={() => onAttachment("save", a.index)} className="text-primary hover:underline">저장</button>
                  </li>
                ))}
              </ul>
            )}
          </header>
          {detail.remoteImagesBlocked && !allowImages && (
            <div className="px-6 py-2 text-xs bg-bg border-b border-border flex items-center justify-between gap-3">
              <span className="text-text-muted">개인정보 보호를 위해 외부 이미지를 막았습니다.</span>
              <button type="button" onClick={onShowImages} className="text-primary hover:underline shrink-0">이미지 보기</button>
            </div>
          )}
          <div className="flex-1 min-h-0 p-3">
            {detail.html ? (
              <MailHtmlFrame html={detail.html} allowRemoteImages={allowImages} title={`메일 내용: ${subjectLabel(detail)}`} />
            ) : (
              <pre className="h-full overflow-auto whitespace-pre-wrap break-words text-sm px-3 py-2 font-sans">{detail.text || "(내용 없음)"}</pre>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
