import { Bell, CheckCheck, ChevronDown, Megaphone, Plus, Stamp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { apiGet, apiPut } from "../../lib/api";
import { isAdminRole } from "../../lib/auth";
import { formatDate } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { Notice } from "./types";

interface AppNotification {
  id: number;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  my_approval_done: boolean | null;
}

interface AllNotification {
  id: number;
  user_id: number;
  recipient_name: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

// 알림 목록용 짧은 날짜/시간: "10-02 14:08"
function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function groupByMonth(items: AppNotification[]): [string, AppNotification[]][] {
  const groups: [string, AppNotification[]][] = [];
  for (const item of items) {
    const key = monthLabel(item.created_at);
    const existing = groups.find(([month]) => month === key);
    if (existing) existing[1].push(item);
    else groups.push([key, [item]]);
  }
  return groups;
}

export function NoticesPage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [allNotifications, setAllNotifications] = useState<AllNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedNoticeId, setExpandedNoticeId] = useState<number | null>(null);

  function loadNotifications() {
    apiGet<AppNotification[]>("/api/notifications")
      .then(setNotifications)
      .catch((err) => logError("Notices", "업무 알림 조회 실패", err));
  }

  useEffect(() => {
    logDebug("Notices", "목록 조회 시작");
    apiGet<Notice[]>("/api/notices")
      .then(setNotices)
      .catch((err) => {
        logError("Notices", "목록 조회 실패", err);
        setError("공지사항을 불러오지 못했습니다.");
      });
    loadNotifications();
    // 대표(admin)는 전 직원의 업무 알림도 열람한다.
    if (user?.role === "admin") {
      logDebug("Notices", "전 직원 업무 알림 조회 시작");
      apiGet<AllNotification[]>("/api/notifications/all")
        .then(setAllNotifications)
        .catch((err) => logError("Notices", "전 직원 업무 알림 조회 실패", err));
    }
  }, [user?.role]);

  // 알림을 누르면 읽음 처리하고, 연결된 문서가 있으면 그 문서로 바로 이동한다 (이동은 Link가 처리).
  async function handleOpenNotification(n: AppNotification) {
    logDebug("Notices", `알림 열기: id=${n.id}`);
    if (n.is_read) return;
    try {
      await apiPut(`/api/notifications/${n.id}/read`);
      setNotifications((prev) => prev?.map((item) => (item.id === n.id ? { ...item, is_read: true } : item)) ?? prev);
    } catch (err) {
      logError("Notices", "알림 읽음 처리 실패", err);
    }
  }

  async function handleMarkAllRead() {
    try {
      await apiPut("/api/notifications/read-all");
      setNotifications((prev) => prev?.map((item) => ({ ...item, is_read: true })) ?? prev);
    } catch (err) {
      logError("Notices", "알림 전체 읽음 처리 실패", err);
    }
  }

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;

  return (
    <MainLayout
      title="업무 알림"
      description="결재 완료 등 나에게 온 업무 알림과 전 직원 공지사항을 확인하세요."
      actions={
        isAdminRole(user?.role) && (
          <Link
            to="/notices/new"
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            새 공지 작성
          </Link>
        )
      }
    >
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Bell size={15} />내 알림
          </h2>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5"
            >
              <CheckCheck size={13} />
              모두 읽음
            </button>
          )}
        </div>

        {notifications === null && <p className="text-sm text-text-muted">불러오는 중...</p>}
        {notifications !== null && notifications.length === 0 && (
          <p className="text-sm text-text-muted">받은 업무 알림이 없습니다.</p>
        )}
        {notifications !== null && notifications.length > 0 && (
          <div className="bg-surface border border-border rounded-2xl p-4">
            {groupByMonth(notifications).map(([month, items]) => (
              <div key={month} className="mb-3 last:mb-0">
                <p className="text-[11px] text-text-muted font-medium mb-1">{month}</p>
                {items.map((n) => {
                  const rowClass = `grid grid-cols-[8px_auto_minmax(0,1fr)] sm:grid-cols-[8px_96px_minmax(0,210px)_minmax(0,1fr)_auto] items-center gap-x-2.5 px-1.5 py-2.5 rounded-md border-t border-border first:border-t-0 hover:bg-bg transition-colors ${
                    n.is_read ? "opacity-70" : ""
                  }`;
                  const content = (
                    <>
                      {n.is_read ? <span /> : <span className="w-1.5 h-1.5 rounded-full bg-notify" />}
                      <span className="text-[11px] text-text-muted tabular-nums">{formatShortDateTime(n.created_at)}</span>
                      <span className="text-[13px] font-medium truncate">{n.title}</span>
                      <span className="hidden sm:block text-xs text-text-muted truncate">{n.message.split("\n")[0]}</span>
                      {n.my_approval_done ? (
                        <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] font-semibold text-danger border border-danger/60 rounded-full px-1.5 py-px -rotate-3">
                          <Stamp size={10} />
                          결재완료
                        </span>
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                    </>
                  );
                  return n.link ? (
                    <Link key={n.id} to={n.link} onClick={() => handleOpenNotification(n)} className={rowClass}>
                      {content}
                    </Link>
                  ) : (
                    <button key={n.id} type="button" onClick={() => handleOpenNotification(n)} className={`${rowClass} w-full text-left`}>
                      {content}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      {user?.role === "admin" && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Users size={15} />전 직원 알림
          </h2>
          {allNotifications === null && <p className="text-sm text-text-muted">불러오는 중...</p>}
          {allNotifications !== null && allNotifications.length === 0 && (
            <p className="text-sm text-text-muted">직원들에게 발송된 업무 알림이 없습니다.</p>
          )}
          {allNotifications !== null && allNotifications.length > 0 && (
            <div className="bg-surface border border-border rounded-2xl p-4">
              {allNotifications.map((n) => (
                <div
                  key={n.id}
                  className="grid grid-cols-[96px_64px_minmax(0,210px)_minmax(0,1fr)] items-center gap-x-2.5 px-1.5 py-2.5 border-t border-border first:border-t-0"
                >
                  <span className="text-[11px] text-text-muted tabular-nums">{formatShortDateTime(n.created_at)}</span>
                  <span className="text-[12px] font-medium truncate">{n.recipient_name}</span>
                  <span className="text-[13px] font-medium truncate">{n.title}</span>
                  <span className="text-xs text-text-muted truncate">{n.message.split("\n")[0]}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold mb-3">공지사항</h2>

        {error && <p className="text-sm text-danger mb-4">{error}</p>}

        {notices === null && !error && <p className="text-sm text-text-muted">불러오는 중...</p>}

        {notices !== null && notices.length === 0 && (
          <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
            <Megaphone className="mx-auto mb-2 text-text-muted" size={24} />
            <p className="text-sm text-text-muted">등록된 공지사항이 없습니다.</p>
          </div>
        )}

        {notices !== null && notices.length > 0 && (
          <div className="space-y-2">
            {notices.map((notice) => {
              const open = expandedNoticeId === notice.id;
              return (
                <div key={notice.id} className="bg-surface border border-border rounded-2xl transition-colors">
                  <button
                    onClick={() => setExpandedNoticeId((prev) => (prev === notice.id ? null : notice.id))}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <ChevronDown
                        size={14}
                        className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
                      />
                      <span className="font-medium text-text truncate">{notice.title}</span>
                    </span>
                    <span className="text-xs text-text-muted shrink-0">{formatDate(notice.created_at)}</span>
                  </button>
                  {open && (
                    <div className="px-5 pb-4 pl-11">
                      <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">{notice.content}</p>
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-xs text-text-muted">작성자: {notice.author_name}</p>
                        <Link
                          to={`/notices/${notice.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-primary hover:underline"
                        >
                          상세보기 →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </MainLayout>
  );
}
