import { CalendarDays, LayoutGrid, LogOut, Megaphone, MessageCircle, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useMessengerOptional } from "../../features/messenger/useMessenger";
import { Logo } from "../ui/Logo";
import { DesktopDownloadLink } from "../../features/desktop/DesktopDownloadLink";
import { VersionLabel } from "./VersionLabel";

const menuItems = [
  { to: "/", label: "대시보드", icon: LayoutGrid, end: true },
  { to: "/schedule", label: "일정관리", icon: CalendarDays },
  { to: "/messenger", label: "메신저", icon: MessageCircle },
  { to: "/notices", label: "공지사항", icon: Megaphone },
  { to: "/settings", label: "직원등록", icon: Settings },
];

export function SiteAdminSidebar() {
  const { user, logout } = useAuth();
  const messengerUnread = useMessengerOptional()?.unreadTotal ?? 0;

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
            {to === "/messenger" && messengerUnread > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-badge-bg border border-badge-border text-badge-fg text-[10px] font-semibold flex items-center justify-center" aria-label={`안 읽은 메시지 ${messengerUnread}개`}>
                {messengerUnread > 99 ? "99+" : messengerUnread}
              </span>
            )}
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
          <VersionLabel />
          <DesktopDownloadLink className="mt-2" />
        </div>
      )}
    </aside>
  );
}
