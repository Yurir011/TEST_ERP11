import { useEffect, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "../lib/api";
import { clearToken, getToken, setToken, type CurrentUser } from "../lib/auth";
import { logDebug, logError } from "../lib/logger";
import { AuthContext } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  // 저장된 토큰이 없으면 확인할 것이 없으므로 처음부터 로딩 상태가 아니다.
  const [isLoading, setIsLoading] = useState(() => Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    logDebug("Auth", "저장된 토큰으로 사용자 정보 조회 시도");
    apiGet<CurrentUser>("/api/auth/me")
      .then((me) => setUser(me))
      .catch(() => {
        logError("Auth", "토큰 검증 실패, 로그아웃 처리");
        clearToken();
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    logDebug("Auth", `로그인 시도: email=${email}`);
    const { access_token } = await apiPost<{ access_token: string }>("/api/auth/login", { email, password });
    setToken(access_token);
    const me = await apiGet<CurrentUser>("/api/auth/me");
    setUser(me);
    logDebug("Auth", `로그인 성공: role=${me.role}`);
  }

  function logout() {
    logDebug("Auth", "로그아웃");
    clearToken();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}
