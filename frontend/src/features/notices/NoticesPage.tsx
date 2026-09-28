import { Bell, CheckCheck, ChevronDown, Megaphone, Plus } from "lucide-react";
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
}

export function NoticesPage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedNotificationId, setExpandedNotificationId] = useState<number | null>(null);
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
  }, []);

  async function handleToggleNotification(n: AppNotification) {
    logDebug("Notices", `알림 펼치기 토글: id=${n.id}`);
    if (!n.is_read) {
      try {
        await apiPut(`/api/notifications/${n.id}/read`);
        setNotifications((prev) => prev?.map((item) => (item.id === n.id ? { ...item, is_read: true } : item)) ?? prev);
      } catch (err) {
        logError("Notices", "알림 읽음 처리 실패", err);
      }
    }
    setExpandedNotificationId((prev) => (prev === n.id ? null : n.id));
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
          <div className="space-y-2">
            {notifications.map((n) => {
              const open = expandedNotificationId === n.id;
              return (
                <div
                  key={n.id}
                  className={`rounded-xl border transition-colors ${
                    n.is_read ? "bg-surface border-border" : "bg-tile-blue border-tile-blue-fg/30"
                  }`}
                >
                  <button
                    onClick={() => handleToggleNotification(n)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <ChevronDown
                        size={14}
                        className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
                      />
                      <span className={`text-sm truncate ${n.is_read ? "text-text-muted" : "font-medium text-text"}`}>
                        {n.title}
                      </span>
                    </span>
                    <span className="text-xs text-text-muted shrink-0">{formatDate(n.created_at)}</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-3 pl-9">
                      <p className="text-xs text-text-muted">{n.message}</p>
                      {n.link && (
                        <Link
                          to={n.link}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-block mt-2 text-xs text-primary hover:underline"
                        >
                          바로가기 →
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

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
