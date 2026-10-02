import { Bell, ChevronDown, ChevronUp, Stamp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  my_approval_done: boolean | null;
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

// 알림 목록용 짧은 날짜/시간: "10-02 14:08" (업무 알림 화면과 같은 형식)
function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function groupByMonth(items: NotificationItem[]): [string, NotificationItem[]][] {
  const groups: [string, NotificationItem[]][] = [];
  for (const item of items) {
    const key = monthLabel(item.created_at);
    const existing = groups.find(([month]) => month === key);
    if (existing) {
      existing[1].push(item);
    } else {
      groups.push([key, [item]]);
    }
  }
  return groups;
}

function NotificationGroups({
  groups,
  unread,
  onOpen,
}: {
  groups: [string, NotificationItem[]][];
  unread: boolean;
  onOpen: (notification: NotificationItem) => void;
}) {
  return (
    <>
      {groups.map(([month, items]) => (
        <div key={month} className="mb-2.5 last:mb-0">
          <p className="text-[11px] text-text-muted font-medium mb-1">{month}</p>
          <ul>
            {items.map((n, idx) => (
              <li key={n.id} className={idx < items.length - 1 ? "border-b border-border" : ""}>
                <Link
                  to={n.link ?? "#"}
                  onClick={() => onOpen(n)}
                  className={`block py-1.5 hover:text-primary transition-colors ${unread ? "" : "opacity-70"}`}
                >
                  <div className="flex items-center gap-1.5">
                    {unread && <span className="w-1.5 h-1.5 rounded-full bg-notify shrink-0" />}
                    <span className="text-[11px] text-text-muted tabular-nums shrink-0">{formatShortDateTime(n.created_at)}</span>
                    <p className="text-[13px] font-medium truncate">{n.title}</p>
                    {n.my_approval_done && (
                      <span className="ml-auto shrink-0 inline-flex items-center gap-0.5 text-[11px] font-semibold text-danger border border-danger/60 rounded-full px-1.5 py-px -rotate-3">
                        <Stamp size={10} />
                        결재완료
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 truncate">{n.message}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function MyNotificationsBoard() {
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(null);
  const [showRead, setShowRead] = useState(false);

  function load() {
    logDebug("Dashboard", "내 업무 알림 조회 시작");
    apiGet<NotificationItem[]>("/api/notifications")
      .then(setNotifications)
      .catch((err) => {
        logError("Dashboard", "내 업무 알림 조회 실패", err);
        setNotifications([]);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handleOpen(notification: NotificationItem) {
    if (notification.is_read) return;
    try {
      await apiPut(`/api/notifications/${notification.id}/read`);
      setNotifications((prev) => prev?.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)) ?? prev);
      logDebug("Dashboard", `알림 읽음 처리: id=${notification.id}`);
    } catch (err) {
      logError("Dashboard", "알림 읽음 처리 실패", err);
    }
  }

  const unread = notifications?.filter((n) => !n.is_read) ?? [];
  const read = notifications?.filter((n) => n.is_read) ?? [];

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-xs font-semibold flex items-center gap-1.5">
          <Bell size={13} />내 업무 알림
        </h2>
        {unread.length > 0 && (
          <span className="font-medium bg-badge-bg border border-badge-border text-badge-fg px-2 py-0.5 rounded-full text-[11px]">
            {unread.length}건
          </span>
        )}
      </div>

      {notifications === null && <p className="text-xs text-text-muted">불러오는 중...</p>}

      {notifications !== null && <NotificationGroups groups={groupByMonth(unread)} unread onOpen={handleOpen} />}

      {notifications !== null && read.length > 0 && (
        <div className={unread.length > 0 ? "mt-2.5 pt-2.5 border-t border-border" : ""}>
          <button
            type="button"
            onClick={() => setShowRead((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text"
          >
            {showRead ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            읽은 알림 보기 ({read.length}건)
          </button>
          {showRead && (
            <div className="mt-2 max-h-56 overflow-y-auto">
              <NotificationGroups groups={groupByMonth(read)} unread={false} onOpen={handleOpen} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
