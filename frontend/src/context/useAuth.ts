import { createContext, useContext } from "react";
import type { CurrentUser } from "../lib/auth";

// 로그인 상태 컨텍스트와 훅. Provider(AuthContext.tsx)와 파일을 나눠, 컴포넌트 파일이 컴포넌트만 내보내게 한다(빠른 새로고침).

export interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
