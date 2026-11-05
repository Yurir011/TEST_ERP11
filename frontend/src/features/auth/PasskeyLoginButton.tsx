import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchPasskeyEnabled, loginWithPasskey, passkeyErrorMessage, passkeySupported } from "../../lib/passkey";
import { logError } from "../../lib/logger";

/**
 * 로그인 화면의 "지문·얼굴로 로그인" 버튼. 서버에 패스키 설정(도메인)이 있고, 보안 연결(HTTPS)로 연 브라우저에서만 나타난다.
 * 비밀번호 로그인은 그대로 남아 있다 (처음 패스키를 등록할 때와 분실에 대비).
 */
export function PasskeyLoginButton({ onToken }: { onToken: (token: string) => Promise<void> }) {
  const supported = passkeySupported();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void fetchPasskeyEnabled().then((v) => {
      if (alive) setEnabled(v);
    });
    return () => {
      alive = false;
    };
  }, [supported]);

  if (!supported || !enabled) return null;

  async function handleClick() {
    setError(null);
    setBusy(true);
    try {
      await onToken(await loginWithPasskey());
    } catch (err) {
      logError("PasskeyLogin", "패스키 로그인 실패", err);
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 mb-3 text-[11px] text-text-muted">
        <span className="flex-1 border-t border-border" />
        또는
        <span className="flex-1 border-t border-border" />
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-bg hover:bg-surface text-sm font-medium py-2.5 transition-colors disabled:opacity-60"
      >
        <Fingerprint size={18} aria-hidden />
        {busy ? "확인 중..." : "지문·얼굴로 로그인"}
      </button>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
