import { useState, type FormEvent } from "react";
import { PasswordInput } from "../../components/ui/PasswordInput";
import type { MailAccountInfo, MailBridge } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { CUSTOM_PROVIDER_ID, MAIL_PROVIDERS, STANDARD_PORTS, detectProvider, type MailSecurity } from "./mailFormat";

const INPUT = "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg";

interface Props {
  bridge: MailBridge;
  onSaved: (info: MailAccountInfo) => void;
  onCancel?: () => void;
  initial?: MailAccountInfo | null;
}

export function MailAccountForm({ bridge, onSaved, onCancel, initial }: Props) {
  const first = MAIL_PROVIDERS[0];
  const [providerId, setProviderId] = useState(detectProvider(initial));
  const [email, setEmail] = useState(initial?.email ?? "");
  const [username, setUsername] = useState(initial && initial.username !== initial.email ? initial.username : "");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState(initial?.imapHost ?? first.imapHost);
  const [imapPort, setImapPort] = useState(String(initial?.imapPort ?? first.imapPort));
  const [imapSecurity, setImapSecurity] = useState<MailSecurity>(initial?.imapSecurity ?? first.imapSecurity);
  const [smtpHost, setSmtpHost] = useState(initial?.smtpHost ?? first.smtpHost);
  const [smtpPort, setSmtpPort] = useState(String(initial?.smtpPort ?? first.smtpPort));
  const [smtpSecurity, setSmtpSecurity] = useState<MailSecurity>(initial?.smtpSecurity ?? first.smtpSecurity);
  const [saveToSent, setSaveToSent] = useState(initial?.saveToSent ?? first.saveToSent);
  const [syncDays, setSyncDays] = useState(initial?.syncDays ?? 90);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const provider = MAIL_PROVIDERS.find((p) => p.id === providerId);

  /** 서비스를 고르면 서버 주소·포트·암호화 방식이 그 서비스 값으로 채워진다. 직접 입력을 고르면 지금 값을 그대로 둔다. */
  function chooseProvider(id: string) {
    setProviderId(id);
    const p = MAIL_PROVIDERS.find((x) => x.id === id);
    if (!p) {
      setShowAdvanced(true);
      return;
    }
    setImapHost(p.imapHost);
    setImapPort(p.imapPort);
    setImapSecurity(p.imapSecurity);
    setSmtpHost(p.smtpHost);
    setSmtpPort(p.smtpPort);
    setSmtpSecurity(p.smtpSecurity);
    setSaveToSent(p.saveToSent);
  }

  // 암호화 방식을 바꾸면 그 방식의 표준 포트로 함께 바꾼다 (직접 정한 다른 포트는 그대로 둔다)
  function changeSecurity(kind: "imap" | "smtp", next: MailSecurity) {
    const ports = STANDARD_PORTS[kind];
    const other: MailSecurity = next === "ssl" ? "starttls" : "ssl";
    if (kind === "imap") {
      setImapSecurity(next);
      if (imapPort === ports[other]) setImapPort(ports[next]);
    } else {
      setSmtpSecurity(next);
      if (smtpPort === ports[other]) setSmtpPort(ports[next]);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    logDebug("Mail", `계정 등록 시도(접속 확인 포함): 서비스=${providerId}`);
    try {
      const trimmedEmail = email.trim();
      // 로그인 아이디가 이메일 앞부분뿐인 서비스(네이버)는 비워 두면 앞부분으로 채운다
      const defaultUsername = provider?.usernameIsLocalPart ? trimmedEmail.split("@")[0] : undefined;
      const r = await bridge.saveAccount({
        email: trimmedEmail,
        username: username.trim() || defaultUsername || undefined,
        password,
        imapHost: imapHost.trim(),
        imapPort: Number(imapPort),
        imapSecurity,
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort),
        smtpSecurity,
        saveToSent,
        syncDays,
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
        <label htmlFor="mail-provider" className="block text-xs text-text-muted mb-1.5">메일 서비스</label>
        <select id="mail-provider" value={providerId} onChange={(e) => chooseProvider(e.target.value)} className={INPUT}>
          {MAIL_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value={CUSTOM_PROVIDER_ID}>직접 입력 (IMAP/SMTP)</option>
        </select>
        {provider && <p className="text-xs text-text-muted mt-1.5">{provider.hint}</p>}
        {!provider && <p className="text-xs text-text-muted mt-1.5">아래 서버 설정에 받는 메일(IMAP)·보내는 메일(SMTP) 서버를 직접 입력하세요.</p>}
      </div>
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

      <div>
        <label htmlFor="mail-sync-days" className="block text-xs text-text-muted mb-1.5">가져올 메일 기간</label>
        <select id="mail-sync-days" value={syncDays} onChange={(e) => setSyncDays(Number(e.target.value))} className={INPUT}>
          <option value={90}>최근 3개월</option>
          <option value={365}>최근 1년</option>
          <option value={1095}>최근 3년</option>
          <option value={0}>전체 (서버에 있는 메일 모두)</option>
        </select>
        <p className="text-xs text-text-muted mt-1.5">기간이 길수록 처음 받아 오는 데 시간이 걸리고 이 PC 의 저장 공간을 더 씁니다. 나중에 바꿀 수 있습니다.</p>
      </div>

      <button type="button" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced} className="text-xs text-primary hover:underline">
        {showAdvanced ? "서버 설정 숨기기" : `서버 설정 보기${provider ? ` (${provider.label} 기본값)` : ""}`}
      </button>
      {showAdvanced && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div>
            <label htmlFor="mail-username" className="block text-xs text-text-muted mb-1.5">로그인 아이디 (이메일과 다를 때만)</label>
            <input id="mail-username" value={username} onChange={(e) => setUsername(e.target.value)} className={INPUT} placeholder={provider?.usernameIsLocalPart ? "비워 두면 이메일 앞부분(@ 앞)" : "비워 두면 이메일 주소"} />
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div>
              <label htmlFor="mail-imap-host" className="block text-xs text-text-muted mb-1.5">받는 메일(IMAP) 서버</label>
              <input id="mail-imap-host" value={imapHost} onChange={(e) => setImapHost(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="mail-imap-port" className="block text-xs text-text-muted mb-1.5">포트</label>
              <input id="mail-imap-port" inputMode="numeric" value={imapPort} onChange={(e) => setImapPort(e.target.value)} className={INPUT} />
            </div>
          </div>
          <div>
            <label htmlFor="mail-imap-security" className="block text-xs text-text-muted mb-1.5">받는 메일 암호화</label>
            <select id="mail-imap-security" value={imapSecurity} onChange={(e) => changeSecurity("imap", e.target.value as MailSecurity)} className={INPUT}>
              <option value="ssl">SSL/TLS (처음부터 암호화, 보통 993)</option>
              <option value="starttls">STARTTLS (접속 후 암호화, 보통 143)</option>
            </select>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div>
              <label htmlFor="mail-smtp-host" className="block text-xs text-text-muted mb-1.5">보내는 메일(SMTP) 서버</label>
              <input id="mail-smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="mail-smtp-port" className="block text-xs text-text-muted mb-1.5">포트</label>
              <input id="mail-smtp-port" inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className={INPUT} />
            </div>
          </div>
          <div>
            <label htmlFor="mail-smtp-security" className="block text-xs text-text-muted mb-1.5">보내는 메일 암호화</label>
            <select id="mail-smtp-security" value={smtpSecurity} onChange={(e) => changeSecurity("smtp", e.target.value as MailSecurity)} className={INPUT}>
              <option value="ssl">SSL/TLS (처음부터 암호화, 보통 465)</option>
              <option value="starttls">STARTTLS (접속 후 암호화, 보통 587)</option>
            </select>
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
