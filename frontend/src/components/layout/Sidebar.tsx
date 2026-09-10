import {
  Banknote,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutGrid,
  LogOut,
  Megaphone,
  Receipt,
  Settings,
  Timer,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { TodoPanel } from "../../features/todos/TodoPanel";
import { Logo } from "../ui/Logo";

const menuItems = [
  { to: "/", label: "대시보드", icon: LayoutGrid, end: true, adminOnly: false, colorClass: "" },
  { to: "/schedule", label: "일정관리", icon: CalendarDays, adminOnly: false, colorClass: "" },
  { to: "/attendance", label: "출퇴근기록", icon: Timer, adminOnly: false, colorClass: "" },
  { to: "/leaves", label: "연차관리", icon: ClipboardList, adminOnly: false, colorClass: "" },
  { to: "/documents", label: "재직증명서", icon: FileText, adminOnly: false, colorClass: "" },
  { to: "/projects", label: "프로젝트관리", icon: FileText, adminOnly: false, colorClass: "" },
  { to: "/clients", label: "거래처관리", icon: Building2, adminOnly: false, colorClass: "" },
  { to: "/transactions", label: "매입매출관리", icon: Receipt, adminOnly: true, colorClass: "text-primary" },
  { to: "/payments", label: "입출금관리", icon: Banknote, adminOnly: true, colorClass: "text-primary" },
  { to: "/notices", label: "공지사항", icon: Megaphone, adminOnly: false, colorClass: "text-danger" },
  { to: "/settings", label: "설정", icon: Settings, adminOnly: true, colorClass: "text-primary" },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const visibleItems = menuItems.filter((item) => !item.adminOnly || user?.role === "admin");

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
          </NavLink>
        ))}
      </nav>

      <TodoPanel />

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
