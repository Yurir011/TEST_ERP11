import { useState, type FormEvent } from "react";
import { PasswordInput } from "../../components/ui/PasswordInput";
import type { MailAccountInfo, MailBridge } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { DAUM_DEFAULTS } from "./mailFormat";

const INPUT = "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg";

interface Props {
  bridge: MailBridge;
  onSaved: (info: MailAccountInfo) => void;
  onCancel?: () => void;
  initial?: MailAccountInfo | null;
}

export function MailAccountForm({ bridge, onSaved, onCancel, initial }: Props) {
  const [email, setEmail] = useState(initial?.email ?? "");
  const [username, setUsername] = useState(initial && initial.username !== initial.email ? initial.username : "");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState(initial?.imapHost ?? DAUM_DEFAULTS.imapHost);
  const [imapPort, setImapPort] = useState(String(initial?.imapPort ?? DAUM_DEFAULTS.imapPort));
  const [smtpHost, setSmtpHost] = useState(initial?.smtpHost ?? DAUM_DEFAULTS.smtpHost);
  const [smtpPort, setSmtpPort] = useState(String(initial?.smtpPort ?? DAUM_DEFAULTS.smtpPort));
  const [saveToSent, setSaveToSent] = useState(initial?.saveToSent ?? false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    logDebug("Mail", "계정 등록 시도(접속 확인 포함)");
    try {
      const r = await bridge.saveAccount({
        email: email.trim(),
        username: username.trim() || undefined,
        password,
        imapHost: imapHost.trim(),
        imapPort: Number(imapPort),
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort),
        saveToSent,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPassword(""); // 화면에 비밀번호를 남겨 두지 않는다
      onSaved(r.value);
    } catch (err) {
      logError("Mail", "계정 등록 실패", err);
      setError("계정을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4" aria-label="메일 계정 등록">
      <div>
        <label htmlFor="mail-email" className="block text-xs text-text-muted mb-1.5">이메일 주소</label>
        <input id="mail-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} placeholder="you@company.co.kr" />
      </div>
      <div>
        <label htmlFor="mail-password" className="block text-xs text-text-muted mb-1.5">메일 비밀번호</label>
        <PasswordInput id="mail-password" required autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} placeholder="••••••••" />
        <p className="text-xs text-text-muted mt-1.5">
          비밀번호는 이 PC 에서만 암호화해 보관하고 ERP 서버로는 보내지 않습니다. 2단계 인증을 쓰는 계정은 앱 비밀번호를 입력하세요.
        </p>
      </div>

      <button type="button" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced} className="text-xs text-primary hover:underline">
        {showAdvanced ? "서버 설정 숨기기" : "서버 설정 보기 (기본값: 다음스마트워크)"}
      </button>
      {showAdvanced && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div>
            <label htmlFor="mail-username" className="block text-xs text-text-muted mb-1.5">로그인 아이디 (이메일과 다를 때만)</label>
            <input id="mail-username" value={username} onChange={(e) => setUsername(e.target.value)} className={INPUT} placeholder="비워 두면 이메일 주소" />
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div>
              <label htmlFor="mail-imap-host" className="block text-xs text-text-muted mb-1.5">받는 메일(IMAP) 서버</label>
              <input id="mail-imap-host" value={imapHost} onChange={(e) => setImapHost(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="mail-imap-port" className="block text-xs text-text-muted mb-1.5">포트(SSL)</label>
              <input id="mail-imap-port" inputMode="numeric" value={imapPort} onChange={(e) => setImapPort(e.target.value)} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div>
              <label htmlFor="mail-smtp-host" className="block text-xs text-text-muted mb-1.5">보내는 메일(SMTP) 서버</label>
              <input id="mail-smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="mail-smtp-port" className="block text-xs text-text-muted mb-1.5">포트(SSL)</label>
              <input id="mail-smtp-port" inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className={INPUT} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm pt-1">
            <input type="checkbox" checked={saveToSent} onChange={(e) => setSaveToSent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary" />
            <span>
              보낸 메일을 보낸메일함에도 직접 저장
              <span className="block text-xs text-text-muted">서버가 보낸 메일을 자동으로 보관하면 켜지 마세요(중복 저장됩니다). 보낸메일함에 보낸 메일이 보이지 않을 때만 켜세요.</span>
            </span>
          </label>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2 transition-colors disabled:opacity-60">
          {busy ? "접속 확인 중..." : "등록"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-border text-sm px-4 py-2 hover:bg-bg">
            취소
          </button>
        )}
      </div>
    </form>
  );
}
