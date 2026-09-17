import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AttendanceRecord } from "../features/attendance/types";
import { apiGet, apiPost } from "../lib/api";
import { clearToken, getToken, setToken, type CurrentUser } from "../lib/auth";
import { logDebug, logError } from "../lib/logger";

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
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
    await promptClockInIfNeeded();
  }

  async function promptClockInIfNeeded() {
    try {
      const today = await apiGet<AttendanceRecord | null>("/api/attendance/today");
      if (today?.clock_in) return;
      logDebug("Auth", "로그인 시 출근 여부 확인 팝업 표시");
      if (window.confirm("오늘 출근 처리 하시겠습니까?")) {
        await apiPost<AttendanceRecord>("/api/attendance/clock-in");
        logDebug("Auth", "로그인 시 출근 처리 완료");
      }
    } catch (err) {
      logError("Auth", "로그인 시 출근 확인 실패", err);
    }
  }

  function logout() {
    logDebug("Auth", "로그아웃");
    clearToken();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
