import { Paperclip, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import type { MailBridge, MailDraft, MailIdentitySettings, MailSendResult, MailSenderIdentity, MailStagedAttachment } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { RecipientInput } from "./RecipientInput";
import { SenderManager, SenderPicker } from "./SenderPicker";
import { defaultSender, sameAddress, senderOptions } from "./senderIdentity";
import { MAX_ATTACHMENT_BYTES, formatFileSize } from "./mailFormat";

interface Props {
  bridge: MailBridge;
  fromName: string;
  fromEmail: string;
  initial: Pick<MailDraft, "to" | "cc" | "subject" | "body" | "attachments" | "threading">;
  /** sent: 보낸 주소·제목 (문서에서 시작한 메일의 발송 이력을 남길 때 쓴다) */
  onSent: (result: MailSendResult, sent: { to: string; cc: string; bcc: string; subject: string }) => void;
  onClose: () => void;
  /** 작성 내용이 바뀌었는지와 준비된 첨부 번호를 바깥(다른 화면으로 나갈 때 버릴지 묻는 쪽)에 알린다 */
  onState?: (state: { dirty: boolean; attachmentIds: string[] }) => void;
}

const INPUT = "flex-1 min-w-0 bg-transparent text-sm outline-none py-2";
const ROW = "flex items-center gap-3 px-6 border-b border-border";
const LABEL = "w-20 shrink-0 text-sm text-text-muted";

/** 메일 쓰기 화면: 새 메일·내게쓰기·답장·전체답장·전달이 모두 이 화면을 쓴다 */
export function ComposeView({ bridge, fromName, fromEmail, initial, onSent, onClose, onState }: Props) {
  const dialog = useDialog();
  const accountSender = useMemo<MailSenderIdentity>(() => ({ name: fromName, address: fromEmail }), [fromName, fromEmail]);
  const [identities, setIdentities] = useState<MailIdentitySettings>({ items: [], defaultAddress: "" });
  const [sender, setSender] = useState<MailSenderIdentity>(accountSender);
  const [managing, setManaging] = useState(false);
  const senderTouched = useRef(false);
  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(initial.cc.trim() !== "");
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [attachments, setAttachments] = useState<MailStagedAttachment[]>(initial.attachments);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  // 저장된 보내는 사람 목록을 읽어 기본으로 정한 주소를 처음에 고른다 (그 사이 직접 고른 것이 있으면 바꾸지 않는다)
  useEffect(() => {
    let cancelled = false;
    void bridge
      .identities()
      .then((s) => {
        if (cancelled) return;
        setIdentities(s);
        if (!senderTouched.current) setSender(defaultSender(s, accountSender));
      })
      .catch((err) => logError("Mail", "보내는 사람 목록을 읽지 못했습니다", err));
    return () => {
      cancelled = true;
    };
  }, [bridge, accountSender]);

  const total = attachments.reduce((n, a) => n + a.size, 0);
  const dirty =
    to !== initial.to || cc !== initial.cc || bcc !== "" || subject !== initial.subject || body !== initial.body || attachments.length !== initial.attachments.length;

  const attachmentKey = attachments.map((a) => a.id).join();
  useEffect(() => {
    onState?.({ dirty, attachmentIds: attachmentKey ? attachmentKey.split(",") : [] });
  }, [dirty, attachmentKey, onState]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (sending.current) return; // 두 번 눌러도 한 번만 보낸다
    if (total > MAX_ATTACHMENT_BYTES) {
      setError(`첨부 파일 크기의 합이 너무 큽니다(최대 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB).`);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    logDebug("Mail", `메일 보내기 시도: 첨부 ${attachments.length}개`);
    try {
      const r = await bridge.send({ fromName: sender.name || fromName, fromAddress: sender.address, to, cc, bcc, subject, body, attachmentIds: attachments.map((a) => a.id), threading: initial.threading });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onSent(r.value, { to, cc, bcc, subject });
    } catch (err) {
      logError("Mail", "메일 보내기 실패", err);
      setError("메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy) return;
    if (dirty && !(await dialog.confirm("작성 중인 메일을 버릴까요?", { okLabel: "버리기", danger: true }))) return;
    await bridge.discardAttachments(attachments.map((a) => a.id));
    onClose();
  }

  async function attach() {
    const r = await bridge.pickAttachments();
    if (!r.ok) {
      if (!r.canceled) setError(r.error);
      return;
    }
    setError(null);
    setAttachments((prev) => [...prev, ...r.value]);
  }

  async function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    await bridge.discardAttachments([id]);
  }

  return (
    <form onSubmit={(e) => void send(e)} className="flex flex-col h-full min-w-0" aria-label="메일 쓰기" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void send(); }}>
      <div className="flex items-center gap-2 px-6 pt-5 pb-3">
        <h1 className="text-lg font-semibold mr-3">메일쓰기</h1>
        <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60">
          <Send size={15} />
          {busy ? "보내는 중..." : "보내기"}
        </button>
        <button type="button" onClick={() => void cancel()} disabled={busy} className="rounded-lg border border-border text-sm px-4 py-2.5 hover:bg-bg disabled:opacity-60">
          취소
        </button>
        <span className="ml-auto text-xs text-text-muted">Ctrl+Enter 로도 보낼 수 있습니다</span>
      </div>

      {error && <p role="alert" className="mx-6 mb-2 rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="border-t border-border">
        <div className={ROW}>
          <span className={LABEL}>보내는 사람</span>
          <SenderPicker
            options={senderOptions(identities, accountSender)}
            value={sender}
            onChange={(o) => {
              senderTouched.current = true;
              setSender(o);
            }}
            onManage={() => setManaging(true)}
          />
        </div>
        <div className={ROW}>
          <label htmlFor="compose-to" className={LABEL}>받는사람</label>
          <RecipientInput id="compose-to" bridge={bridge} value={to} onChange={setTo} autoFocus={!initial.to} className={`${INPUT} w-full`} placeholder="여러 명은 쉼표(,)로 구분" />
          <div className="flex gap-2 text-xs shrink-0">
            {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-primary hover:underline">참조</button>}
            {!showBcc && <button type="button" onClick={() => setShowBcc(true)} className="text-primary hover:underline">숨은참조</button>}
          </div>
        </div>
        {showCc && (
          <div className={ROW}>
            <label htmlFor="compose-cc" className={LABEL}>참조</label>
            <RecipientInput id="compose-cc" bridge={bridge} value={cc} onChange={setCc} className={`${INPUT} w-full`} />
          </div>
        )}
        {showBcc && (
          <div className={ROW}>
            <label htmlFor="compose-bcc" className={LABEL}>숨은참조</label>
            <RecipientInput id="compose-bcc" bridge={bridge} value={bcc} onChange={setBcc} className={`${INPUT} w-full`} />
          </div>
        )}
        <div className={ROW}>
          <label htmlFor="compose-subject" className={LABEL}>제목</label>
          <input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus={!!initial.to} className={INPUT} autoComplete="off" />
        </div>
        <div className={`${ROW} py-2 items-start`}>
          <span className={`${LABEL} pt-1`}>첨부</span>
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void attach()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg disabled:opacity-60">
              <Paperclip size={14} /> 파일 첨부
            </button>
            <ul className="contents" aria-label="첨부할 파일">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1 text-xs">
                  <span className="max-w-[16rem] truncate" title={a.filename}>{a.filename}</span>
                  <span className="text-text-muted">({formatFileSize(a.size)})</span>
                  <button type="button" onClick={() => void removeAttachment(a.id)} aria-label={`${a.filename} 첨부 빼기`} className="text-text-muted hover:text-danger">
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
            <span className={`text-xs ${total > MAX_ATTACHMENT_BYTES ? "text-danger" : "text-text-muted"}`}>
              {attachments.length > 0 ? `${formatFileSize(total)} / ` : ""}최대 {MAX_ATTACHMENT_BYTES / 1024 / 1024}MB
            </span>
          </div>
        </div>
      </div>

      <label htmlFor="compose-body" className="sr-only">본문</label>
      <textarea
        id="compose-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="flex-1 min-h-0 resize-none px-6 py-4 text-[15px] leading-relaxed outline-none bg-transparent"
        placeholder="내용을 입력하세요"
      />
      {managing && (
        <SenderManager
          bridge={bridge}
          settings={identities}
          account={accountSender}
          onClose={() => setManaging(false)}
          onSaved={(saved) => {
            setIdentities(saved);
            // 고르고 있던 주소가 목록에서 사라졌으면 기본(또는 로그인 계정)으로 돌린다
            if (!senderOptions(saved, accountSender).some((o) => sameAddress(o.address, sender.address))) setSender(defaultSender(saved, accountSender));
            setManaging(false);
          }}
        />
      )}
    </form>
  );
}
