import { Bell, Building2, CalendarCheck, CalendarDays, Clock, FileCheck, Megaphone, Monitor, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../../components/ui/Logo";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { hasMenuPermission } from "../../lib/auth";
import { formatTime } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { AttendanceRecord } from "../attendance/types";
import { toISODate } from "../schedule/dateUtils";
import { EVENT_COLOR_STYLES, type ScheduleEvent } from "../schedule/types";
import { useApprovalQueue } from "./approvalQueue";
import { MobileCard } from "./MobileLayout";
import { setForcePc } from "./mobileMode";
import { useViewportLock } from "./useViewportLock";

interface MenuTile {
  to: string;
  label: string;
  icon: LucideIcon;
  tile: string;
  fg: string;
  badge?: number;
  show: boolean;
}

export function MobileHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useViewportLock();
  const [today, setToday] = useState<AttendanceRecord | null | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null);
  const { items: approvals } = useApprovalQueue();
  const isSiteAdmin = user?.role === "site_admin";

  useEffect(() => {
    logDebug("MobileHome", "홈 데이터 조회 시작");
    if (!isSiteAdmin) {
      apiGet<AttendanceRecord | null>("/api/attendance/today")
        .then(setToday)
        .catch((err) => {
          logError("MobileHome", "오늘 근태 조회 실패", err);
          setToday(null);
        });
    }
    apiGet<{ count: number }>("/api/notifications/unread-count")
      .then((r) => setUnread(r.count))
      .catch((err) => logError("MobileHome", "알림 개수 조회 실패", err));
    const d = toISODate(new Date());
    apiGet<ScheduleEvent[]>(`/api/schedule?start=${d}&end=${d}`)
      .then(setEvents)
      .catch((err) => {
        logError("MobileHome", "오늘 일정 조회 실패", err);
        setEvents([]);
      });
  }, [isSiteAdmin]);

  const isWorking = !!today?.clock_in && !today.clock_out;
  const isDone = !!today?.clock_in && !!today.clock_out;

  async function handleClock() {
    if (isBusy || isDone) return;
    setError(null);
    setIsBusy(true);
    try {
      const path = isWorking ? "/api/attendance/clock-out" : "/api/attendance/clock-in";
      logDebug("MobileHome", `출퇴근 처리 시도: ${path}`);
      setToday(await apiPost<AttendanceRecord>(path));
    } catch (err) {
      logError("MobileHome", "출퇴근 처리 실패", err);
      setError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  function openPc() {
    setForcePc(true);
    navigate("/");
  }

  const tiles: MenuTile[] = [
    { to: "/m/attendance", label: "출퇴근", icon: Clock, tile: "bg-tile-blue", fg: "text-tile-blue-fg", show: !isSiteAdmin },
    { to: "/m/leaves", label: "연차", icon: CalendarCheck, tile: "bg-tile-green", fg: "text-tile-green-fg", show: !isSiteAdmin },
    { to: "/m/notices", label: "공지", icon: Megaphone, tile: "bg-tile-purple", fg: "text-tile-purple-fg", show: hasMenuPermission(user, "notices") },
    { to: "/m/schedule", label: "일정", icon: CalendarDays, tile: "bg-tile-orange", fg: "text-tile-orange-fg", show: true },
    { to: "/m/clients", label: "거래처", icon: Building2, tile: "bg-tile-blue", fg: "text-tile-blue-fg", show: hasMenuPermission(user, "clients") && !isSiteAdmin },
    { to: "/m/notifications", label: "알림", icon: Bell, tile: "bg-tile-orange", fg: "text-tile-orange-fg", badge: unread, show: true },
    { to: "/m/approvals", label: "결재", icon: FileCheck, tile: "bg-tile-green", fg: "text-tile-green-fg", badge: approvals?.length ?? 0, show: !isSiteAdmin },
  ];

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-lg mx-auto px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-4">
        <div className="flex items-center justify-between">
          <Logo iconSize={22} textSize={18} />
          <Link
            to="/m/notifications"
            aria-label="알림"
            className="relative w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center"
          >
            <Bell size={18} />
            {unread > 0 && <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-notify" />}
          </Link>
        </div>

        <div>
          <p className="text-xs text-text-muted">
            {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}
          </p>
          <p className="text-xl font-bold mt-0.5">{user?.name}님, 안녕하세요</p>
        </div>

        {!isSiteAdmin && today !== undefined && (
          <MobileCard className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-tile-green text-tile-green-fg flex items-center justify-center shrink-0">
              <Clock size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted truncate">
                {today?.clock_in
                  ? `오늘 ${formatTime(today.clock_in)} 출근${today.clock_out ? ` · ${formatTime(today.clock_out)} 퇴근` : ""}`
                  : "오늘 아직 출근 전이에요"}
              </p>
              <p className="text-sm font-semibold">{isDone ? "퇴근 완료" : isWorking ? "근무 중" : "출근 전"}</p>
            </div>
            <button
              type="button"
              onClick={handleClock}
              disabled={isBusy || isDone}
              className="bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-40"
            >
              {isWorking ? "퇴근" : "출근"}
            </button>
          </MobileCard>
        )}
        {error && <p className="text-xs text-danger -mt-2">{error}</p>}

        <MobileCard className="py-5 px-2">
          <div className="grid grid-cols-4 gap-y-5">
            {tiles
              .filter((t) => t.show)
              .map((t) => (
                <Link key={t.to} to={t.to} className="flex flex-col items-center gap-1.5 relative active:opacity-60">
                  <span className={`w-14 h-14 rounded-2xl flex items-center justify-center ${t.tile} ${t.fg}`}>
                    <t.icon size={26} />
                  </span>
                  <span className="text-xs font-medium">{t.label}</span>
                  {!!t.badge && (
                    <span className="absolute -top-1 right-1.5 min-w-5 h-5 px-1.5 rounded-full bg-badge-bg border border-badge-border text-badge-fg text-[11px] font-semibold flex items-center justify-center">
                      {t.badge}
                    </span>
                  )}
                </Link>
              ))}
          </div>
        </MobileCard>

        <MobileCard>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">오늘 일정</h2>
            <Link to="/m/schedule" className="text-xs text-primary">
              전체 보기
            </Link>
          </div>
          {events === null ? (
            <p className="text-xs text-text-muted">불러오는 중...</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-text-muted py-2">오늘 등록된 일정이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {events.slice(0, 4).map((ev) => (
                <li key={ev.id} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLOR_STYLES[ev.color].fg }} />
                  <span className={`truncate ${ev.is_completed ? "line-through text-text-muted" : ""}`}>{ev.title}</span>
                </li>
              ))}
              {events.length > 4 && <li className="text-xs text-text-muted">외 {events.length - 4}건</li>}
            </ul>
          )}
        </MobileCard>

        <div className="flex items-center justify-center gap-4 pt-2">
          <button type="button" onClick={openPc} className="flex items-center gap-1 text-xs text-text-muted">
            <Monitor size={13} />
            PC 화면으로 보기
          </button>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="text-xs text-text-muted"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
