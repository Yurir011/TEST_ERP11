import { Bell, FileCheck, Folder, Home, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { LayoutDebug } from "./LayoutDebug";
import { useMobileBadges } from "./useMobileBadges";

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** 사이트 관리자도 쓰는 탭인가 (결재·서류는 일반 직원 전용) */
  siteAdmin: boolean;
}

const TABS: TabDef[] = [
  { to: "/m", label: "홈", icon: Home, end: true, siteAdmin: true },
  { to: "/m/approvals", label: "결재", icon: FileCheck, siteAdmin: false },
  { to: "/m/documents", label: "서류", icon: Folder, siteAdmin: false },
  { to: "/m/notifications", label: "알림", icon: Bell, siteAdmin: true },
];

/** 모바일 화면 하단 탭: 홈·결재·서류·알림. 결재·알림은 처리할 개수를 숫자로 보여 준다. */
export function MobileTabBar() {
  const { user } = useAuth();
  const badges = useMobileBadges();
  const isSiteAdmin = user?.role === "site_admin";
  const count = (to: string) => (to === "/m/approvals" ? badges.approvals : to === "/m/notifications" ? badges.unread : 0);

  return (
    <>
    <LayoutDebug />
    <nav
      aria-label="하단 메뉴"
      className="fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="max-w-lg mx-auto flex">
        {TABS.filter((t) => !isSiteAdmin || t.siteAdmin).map((t) => {
          const n = count(t.to);
          return (
            <li key={t.to} className="flex-1">
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] ${isActive ? "text-primary font-bold" : "text-text-muted font-medium"}`
                }
              >
                <t.icon size={22} aria-hidden />
                {t.label}
                {n > 0 && (
                  <span className="absolute top-1 left-[calc(50%+8px)] min-w-4 h-4 px-1 rounded-full bg-notify text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {n > 99 ? "99+" : n}
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
    </>
  );
}
