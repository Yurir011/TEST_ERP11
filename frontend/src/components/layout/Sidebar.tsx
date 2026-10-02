import {
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  FileSignature,
  FileText,
  LayoutGrid,
  LogOut,
  Receipt,
  ScrollText,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { TodoPanel } from "../../features/todos/TodoPanel";
import { apiGet } from "../../lib/api";
import { hasMenuPermission, type MenuPermissionKey } from "../../lib/auth";
import { logError } from "../../lib/logger";
import { Logo } from "../ui/Logo";

const UNREAD_POLL_MS = 20000;

const menuItems: {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  end?: boolean;
  adminOnly: boolean;
  menuKey?: MenuPermissionKey;
  colorClass: string;
}[] = [
  { to: "/", label: "대시보드", icon: LayoutGrid, end: true, adminOnly: false, colorClass: "" },
  { to: "/schedule", label: "일정관리", icon: CalendarDays, adminOnly: false, colorClass: "" },
  { to: "/approval", label: "전자결재", icon: FileSignature, adminOnly: false, colorClass: "" },
  { to: "/projects", label: "프로젝트관리", icon: FileText, adminOnly: false, menuKey: "projects", colorClass: "" },
  { to: "/clients", label: "거래처관리", icon: Building2, adminOnly: false, menuKey: "clients", colorClass: "" },
  { to: "/tax-invoices", label: "세금계산서", icon: ScrollText, adminOnly: false, menuKey: "tax_invoice", colorClass: "" },
  { to: "/transactions", label: "매입매출관리", icon: Receipt, adminOnly: false, menuKey: "transactions", colorClass: "text-primary" },
  { to: "/payments", label: "입출금관리", icon: Banknote, adminOnly: false, menuKey: "payments", colorClass: "text-primary" },
  { to: "/notices", label: "업무 알림", icon: Bell, adminOnly: false, menuKey: "notices", colorClass: "text-notify" },
  { to: "/settings", label: "직원등록", icon: Settings, adminOnly: true, colorClass: "text-primary" },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const visibleItems = menuItems.filter((item) => {
    if (item.adminOnly) return user?.role === "admin";
    if (item.menuKey) return hasMenuPermission(user, item.menuKey);
    return true;
  });

  useEffect(() => {
    if (!user) return;

    function loadUnreadCount() {
      apiGet<{ count: number }>("/api/notifications/unread-count")
        .then((res) => setUnreadCount(res.count))
        .catch((err) => logError("Sidebar", "안 읽은 알림 개수 조회 실패", err));
    }

    loadUnreadCount();
    const timer = window.setInterval(loadUnreadCount, UNREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [user, location.pathname]);

  return (
    <aside className="w-64 shrink-0 bg-sidebar border-r border-border h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5">
        <Logo />
        <p className="text-xs text-text-muted leading-tight mt-1">사내 ERP 시스템</p>
      </div>

      <p className="px-5 pt-2 pb-1 text-xs text-text-muted">Navigation</p>
      <nav className="px-3 space-y-1 shrink-0">
        {visibleItems.map(({ to, label, icon: Icon, end, colorClass }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                colorClass || (isActive ? "text-text" : "text-text-muted")
              } ${isActive ? "bg-surface font-medium shadow-sm" : "hover:bg-surface/60"}`
            }
          >
            <Icon size={17} />
            {label}
            {to === "/notices" && unreadCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-badge-bg border border-badge-border text-badge-fg text-[10px] font-semibold flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-14 flex-1 min-h-0 flex flex-col">
        <TodoPanel />
      </div>

      {user && (
        <div className="px-3 py-4 border-t border-border">
          <div className="flex items-center justify-between px-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-text-muted truncate">
                {user.role === "admin" ? "관리자" : "일반직원"} · {user.employee_no}
              </p>
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
