import { CalendarDays, CalendarPlus, Megaphone, UserCog, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { QuickActionCard } from "../../components/ui/QuickActionCard";
import { StatCard } from "../../components/ui/StatCard";
import type { CurrentUser } from "../../lib/auth";
import { apiGet } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { toISODate } from "../schedule/dateUtils";
import type { ScheduleEvent } from "../schedule/types";
import type { Notice } from "../notices/types";

export function SiteAdminDashboardPage() {
  const [users, setUsers] = useState<CurrentUser[] | null>(null);
  const [todayEvents, setTodayEvents] = useState<ScheduleEvent[] | null>(null);
  const [recentNotices, setRecentNotices] = useState<Notice[] | null>(null);

  useEffect(() => {
    logDebug("SiteAdminDashboard", "직원 계정 목록 조회 시작");
    apiGet<CurrentUser[]>("/api/users")
      .then(setUsers)
      .catch((err) => logError("SiteAdminDashboard", "직원 계정 목록 조회 실패", err));

    const today = toISODate(new Date());
    logDebug("SiteAdminDashboard", "오늘 일정 조회 시작");
    apiGet<ScheduleEvent[]>(`/api/schedule?start=${today}&end=${today}`)
      .then(setTodayEvents)
      .catch((err) => logError("SiteAdminDashboard", "오늘 일정 조회 실패", err));

    logDebug("SiteAdminDashboard", "최근 공지사항 조회 시작");
    apiGet<Notice[]>("/api/notices")
      .then((notices) => setRecentNotices(notices.slice(0, 5)))
      .catch((err) => logError("SiteAdminDashboard", "최근 공지사항 조회 실패", err));
  }, []);

  const activeCount = users?.filter((u) => u.is_active).length ?? null;

  return (
    <MainLayout title="사이트 관리자 대시보드" description="계정·일정·공지사항 현황을 관리합니다.">
      <section className="mb-8">
        <h2 className="text-sm font-medium text-text-muted mb-3">빠른 실행</h2>
        <div className="grid grid-cols-3 gap-4">
          <QuickActionCard
            to="/schedule"
            title="일정 등록"
            description="새 일정을 빠르게 추가"
            icon={CalendarPlus}
            tile="blue"
          />
          <QuickActionCard
            to="/notices"
            title="공지사항 작성"
            description="전 직원에게 공지"
            icon={Megaphone}
            tile="orange"
          />
          <QuickActionCard
            to="/settings"
            title="직원 계정 관리"
            description="계정 등록·수정·비밀번호 초기화"
            icon={UserCog}
            tile="purple"
          />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="전체 직원 계정" value={users === null ? "-" : `${users.length}명`} icon={Users} />
        <StatCard label="활성 계정" value={activeCount === null ? "-" : `${activeCount}명`} icon={UserCog} />
        <StatCard
          label="오늘 일정"
          value={todayEvents === null ? "-" : `${todayEvents.length}건`}
          icon={CalendarDays}
        />
      </section>

      <section className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="text-sm font-medium mb-4">최근 공지사항</h2>
        {recentNotices === null && <p className="text-sm text-text-muted">불러오는 중...</p>}
        {recentNotices !== null && recentNotices.length === 0 && (
          <p className="text-sm text-text-muted">등록된 공지사항이 없습니다.</p>
        )}
        {recentNotices !== null && recentNotices.length > 0 && (
          <ul className="space-y-3">
            {recentNotices.map((notice) => (
              <li key={notice.id}>
                <Link
                  to={`/notices/${notice.id}`}
                  className="flex items-center justify-between bg-bg rounded-xl px-4 py-3 text-sm hover:bg-border/40 transition-colors"
                >
                  <span>공지사항 '{notice.title}' 등록</span>
                  <span className="text-xs text-text-muted shrink-0 ml-4">{formatDate(notice.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </MainLayout>
  );
}
