import {
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  FileSignature,
  FileText,
  LayoutGrid,
  LogOut,
  Mail,
  MessageCircle,
  Receipt,
  ScrollText,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useMessengerOptional } from "../../features/messenger/useMessenger";
import { TodoPanel } from "../../features/todos/TodoPanel";
import { apiGet } from "../../lib/api";
import { hasMenuPermission, type MenuPermissionKey } from "../../lib/auth";
import { NewMailNotices } from "../../features/mail/NewMailNotices";
import { useNewMailNotices } from "../../features/mail/useNewMailNotices";
import { useMailUnread } from "../../features/mail/useMailUnread";
import { getBenchClient } from "../../lib/desktop";
import { logError } from "../../lib/logger";
import { Logo } from "../ui/Logo";
import { DesktopDownloadLink } from "../../features/desktop/DesktopDownloadLink";
import { useTabMenu } from "./tabs/TabShellContext";
import { VersionLabel } from "./VersionLabel";

const UNREAD_POLL_MS = 20000;

const menuItems: {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  end?: boolean;
  adminOnly: boolean;
  menuKey?: MenuPermissionKey;
  /** 데스크톱 앱에서만 보이는 메뉴 (앱의 메일 기능이 있을 때) */
  desktopMailOnly?: boolean;
  colorClass: string;
}[] = [
  { to: "/", label: "대시보드", icon: LayoutGrid, end: true, adminOnly: false, colorClass: "" },
  { to: "/schedule", label: "일정관리", icon: CalendarDays, adminOnly: false, colorClass: "" },
  { to: "/messenger", label: "메신저", icon: MessageCircle, adminOnly: false, colorClass: "" },
  { to: "/mail", label: "메일", icon: Mail, adminOnly: false, desktopMailOnly: true, colorClass: "" },
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
  const tabMenu = useTabMenu();
  const [unreadCount, setUnreadCount] = useState(0);
  const messengerUnread = useMessengerOptional()?.unreadTotal ?? 0;
  const mailBridge = getBenchClient()?.mail;
  const hasDesktopMail = typeof mailBridge?.openWindow === "function";
  const mailUnreadRaw = useMailUnread(!!user);
  const mailUnread = mailUnreadRaw ?? 0;
  const newMail = useNewMailNotices(mailUnreadRaw);
  const visibleItems = menuItems.filter((item) => {
    if (item.desktopMailOnly && !hasDesktopMail) return false;
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
        {visibleItems.map(({ to, label, icon: Icon, end, colorClass, desktopMailOnly }) =>
          desktopMailOnly ? (
            // 메일은 메뉴 이동이 아니라 별도 창을 여는 버튼이다 (이미 열려 있으면 그 창을 앞으로)
            <div key={to}>
            <button
              type="button"
              onClick={() => {
                console.debug("[Sidebar] 메일 버튼 클릭 → 메일 창 열기");
                void mailBridge?.openWindow();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-muted hover:bg-surface/60 transition-colors text-left"
            >
              <Icon size={17} />
              {label}
              {mailUnread > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-badge-bg border border-badge-border text-badge-fg text-[10px] font-semibold flex items-center justify-center" aria-label={`안 읽은 메일 ${mailUnread}통`}>
                  {mailUnread > 99 ? "99+" : mailUnread}
                </span>
              )}
            </button>
            <NewMailNotices
              items={newMail.items}
              onOpen={(item) => {
                newMail.dismiss(item);
                void mailBridge?.openMessage(item.id, item.accountId);
              }}
              onDismiss={newMail.dismiss}
              onClear={newMail.clear}
            />
            </div>
          ) : (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={(e) => {
              // 메뉴를 누르면 그 메뉴의 탭을 앞으로 가져오고(보던 화면 그대로), 열린 탭이 없으면 새 탭으로 연다.
              // 브라우저 새 탭 열기(Ctrl/Shift/휠 클릭)는 기본 동작을 그대로 둔다.
              if (!tabMenu || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              console.debug(`[Sidebar] 메뉴 클릭 → 탭 열기: ${to}`);
              tabMenu.openMenu(to);
            }}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                colorClass || (isActive ? "text-text" : "text-text-muted")
              } ${isActive ? "bg-surface font-medium shadow-sm" : "hover:bg-surface/60"}`
            }
          >
            <Icon size={17} />
            {label}
            {to === "/messenger" && messengerUnread > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-badge-bg border border-badge-border text-badge-fg text-[10px] font-semibold flex items-center justify-center" aria-label={`안 읽은 메시지 ${messengerUnread}개`}>
                {messengerUnread > 99 ? "99+" : messengerUnread}
              </span>
            )}
            {to === "/notices" && unreadCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-badge-bg border border-badge-border text-badge-fg text-[10px] font-semibold flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>
          ),
        )}
        {/* 브라우저에서는 메일을 볼 수 없으므로 앱이 알려 준 안 읽은 수만 보여 준다 */}
        {!hasDesktopMail && mailUnread > 0 && (
          <p className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-muted" title="메일은 데스크톱 앱에서 확인할 수 있습니다">
            <Mail size={17} />
            안 읽은 메일
            <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-badge-bg border border-badge-border text-badge-fg text-[10px] font-semibold flex items-center justify-center" aria-label={`안 읽은 메일 ${mailUnread}통`}>
              {mailUnread > 99 ? "99+" : mailUnread}
            </span>
          </p>
        )}
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
          <VersionLabel />
          <DesktopDownloadLink className="mt-2" />
        </div>
      )}
    </aside>
  );
}
