import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import { GRADE_LABELS } from "../../lib/auth";
import { Sidebar } from "./Sidebar";
import { SiteAdminSidebar } from "./SiteAdminSidebar";

interface MainLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function MainLayout({ title, description, actions, children }: MainLayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      {user?.role === "site_admin" ? <SiteAdminSidebar /> : <Sidebar />}
      <main className="flex-1 px-10 py-8">
        {user && (
          <div className="flex items-center justify-end gap-3 mb-4">
            <span className="text-sm text-text">
              {user.name} <span className="text-text-muted">{GRADE_LABELS[user.grade]}</span>
            </span>
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
