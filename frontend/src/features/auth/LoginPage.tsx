import { useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../../components/ui/Logo";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { useAuth } from "../../context/useAuth";
import { ApiError } from "../../lib/api";
import { logError } from "../../lib/logger";
import { DesktopDownloadLink } from "../desktop/DesktopDownloadLink";
import { NfcLoginPanel } from "./NfcLoginPanel";

export function LoginPage() {
  const { login, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 카드 로그인: 앱이 서버에서 받아 온 토큰으로 로그인 상태를 만들고 첫 화면으로 간다
  const handleNfcToken = useCallback(
    async (token: string) => {
      await loginWithToken(token);
      navigate("/", { replace: true });
    },
    [loginWithToken, navigate],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      logError("LoginPage", "로그인 실패", err);
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError(err.message); // 로그인 실패가 반복되어 잠시 막힘: 서버가 남은 시간을 안내하는 문구를 보낸다
      } else {
        setError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo iconSize={30} textSize={24} className="mb-2" />
          <p className="text-xs text-text-muted mt-1">사내 계정으로 로그인하세요</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              placeholder="you@company.local"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5" htmlFor="password">
              비밀번호
            </label>
            <PasswordInput
              id="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium py-2.5 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <NfcLoginPanel onToken={handleNfcToken} />

        <div className="mt-5 pt-4 border-t border-border flex justify-center">
          <DesktopDownloadLink />
        </div>
      </div>
    </div>
  );
}
