import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";
import { toMobilePath } from "./mobilePaths";

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function shortDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MobileNotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    logDebug("MobileNotifications", "알림 목록 조회");
    apiGet<NotificationItem[]>("/api/notifications")
      .then(setItems)
      .catch((err) => {
        logError("MobileNotifications", "알림 목록 조회 실패", err);
        setItems([]);
      });
  }, []);

  async function handleOpen(n: NotificationItem) {
    if (!n.is_read) {
      try {
        await apiPut(`/api/notifications/${n.id}/read`);
        setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)) ?? prev);
      } catch (err) {
        logError("MobileNotifications", "읽음 처리 실패", err);
      }
    }
    const target = toMobilePath(n.link);
    if (target) navigate(target);
  }

  async function handleReadAll() {
    try {
      await apiPut("/api/notifications/read-all");
      setItems((prev) => prev?.map((x) => ({ ...x, is_read: true })) ?? prev);
    } catch (err) {
      logError("MobileNotifications", "모두 읽음 처리 실패", err);
    }
  }

  const unreadCount = items?.filter((n) => !n.is_read).length ?? 0;

  return (
    <MobileLayout
      title="알림"
      right={
        unreadCount > 0 ? (
          <button type="button" onClick={handleReadAll} className="text-xs text-primary px-3 py-2">
            모두 읽음
          </button>
        ) : undefined
      }
    >
      {items === null ? (
        <p className="text-xs text-text-muted text-center py-10">불러오는 중...</p>
      ) : items.length === 0 ? (
        <MobileEmpty text="새 알림이 없습니다." />
      ) : (
        <MobileCard className="py-1">
          <ul>
            {items.map((n) => (
              <li key={n.id} className="border-b border-border last:border-0">
                <button type="button" onClick={() => handleOpen(n)} className={`w-full text-left py-3 ${n.is_read ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-1.5">
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-notify shrink-0" />}
                    <p className="text-sm font-medium flex-1 min-w-0 truncate">{n.title}</p>
                    <span className="text-[11px] text-text-muted tabular-nums shrink-0">{shortDateTime(n.created_at)}</span>
                  </div>
                  <p className="text-xs text-text-muted mt-1 break-words">{n.message}</p>
                </button>
              </li>
            ))}
          </ul>
        </MobileCard>
      )}
    </MobileLayout>
  );
}
