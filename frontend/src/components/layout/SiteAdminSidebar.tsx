import { CalendarDays, LayoutGrid, LogOut, Megaphone, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "../ui/Logo";

const menuItems = [
  { to: "/", label: "대시보드", icon: LayoutGrid, end: true },
  { to: "/schedule", label: "일정관리", icon: CalendarDays },
  { to: "/notices", label: "공지사항", icon: Megaphone },
  { to: "/settings", label: "설정", icon: Settings },
];

export function SiteAdminSidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 shrink-0 bg-sidebar border-r border-border h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5">
        <Logo />
        <p className="text-xs text-text-muted leading-tight mt-1">사이트 관리자 모드</p>
      </div>

      <p className="px-5 pt-2 pb-1 text-xs text-text-muted">Navigation</p>
      <nav className="px-3 space-y-1 shrink-0">
        {menuItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive ? "text-text bg-surface font-medium shadow-sm" : "text-text-muted hover:bg-surface/60"
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      {user && (
        <div className="px-3 py-4 border-t border-border">
          <div className="flex items-center justify-between px-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-text-muted truncate">사이트 관리자 · {user.employee_no}</p>
            </div>
            <button
              onClick={logout}
              title="로그아웃"
              className="p-2 rounded-lg text-text-muted hover:bg-surface hover:text-text transition-colors shrink-0"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
