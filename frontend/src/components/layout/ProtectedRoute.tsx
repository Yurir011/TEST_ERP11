import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isAdminRole } from "../../lib/auth";

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  /** 사이트 관리자(site_admin) 계정도 접근 가능한 화면인지 여부 (대시보드/일정관리/공지사항/설정) */
  siteAdminAllowed?: boolean;
}

export function ProtectedRoute({ children, requireAdmin, siteAdminAllowed = false }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-text-muted">로딩 중...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // 사이트 관리자는 대시보드/일정관리/공지사항/설정 외에는 접근할 수 없다.
  if (user.role === "site_admin" && !siteAdminAllowed) {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin && !isAdminRole(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
