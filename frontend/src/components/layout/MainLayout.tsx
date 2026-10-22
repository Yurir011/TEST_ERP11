import { LogOut } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useTabShell } from "./tabs/TabShellContext";
import { useAuth } from "../../context/useAuth";
import { AttendanceToggle } from "../../features/attendance/AttendanceToggle";
import { DesktopUpdateNotice } from "../../features/desktop/DesktopUpdateNotice";
import { TITLE_LABELS } from "../../lib/auth";
import { BackButton } from "../ui/BackButton";
import { Sidebar } from "./Sidebar";
import { SiteAdminSidebar } from "./SiteAdminSidebar";

interface MainLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** 제목 왼쪽 위에 화살표 [뒤로가기]를 둔다 (작성 화면용) */
  showBack?: boolean;
  children: ReactNode;
}

export function MainLayout({ title, description, actions, showBack = false, children }: MainLayoutProps) {
  const { user, logout } = useAuth();
  const tabShell = useTabShell();
  const setTabTitle = tabShell?.setTitle;

  // 탭 막대에 이 화면의 제목을 보여 준다
  useEffect(() => {
    setTabTitle?.(title);
  }, [setTabTitle, title]);

  // 탭 안에서는 사이드바와 사용자 줄을 탭 틀(TabShell)이 한 번만 그리므로 제목과 내용만 그린다.
  if (tabShell) {
    return (
      <main className="px-10 py-8">
        {showBack && <BackButton className="mb-3" />}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-text">{title}</h1>
            {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      {user?.role === "site_admin" ? <SiteAdminSidebar /> : <Sidebar />}
      <main className="flex-1 px-10 py-8">
        <DesktopUpdateNotice />
        {user && (
          <div className="flex items-center justify-end gap-3 mb-4">
            <span className="text-sm text-text">
              {user.name} <span className="text-text-muted">{user.title ? TITLE_LABELS[user.title] : "사원"}</span>
            </span>
            <AttendanceToggle />
            <span className="w-px h-4 bg-border" />
            <button
              onClick={logout}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-danger transition-colors"
            >
              <LogOut size={13} />
              로그아웃
            </button>
          </div>
        )}
        {showBack && <BackButton className="mb-3" />}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-text">{title}</h1>
            {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
