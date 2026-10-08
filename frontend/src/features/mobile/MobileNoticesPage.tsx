import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { Notice } from "../notices/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function MobileNoticesPage() {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    logDebug("MobileNotices", "공지 목록 조회");
    apiGet<Notice[]>("/api/notices")
      .then(setNotices)
      .catch((err) => {
        logError("MobileNotices", "공지 목록 조회 실패", err);
        setNotices([]);
      });
  }, []);

  return (
    <MobileLayout title="공지사항">
      {notices === null ? (
        <p className="text-xs text-text-muted text-center py-10">불러오는 중...</p>
      ) : notices.length === 0 ? (
        <MobileEmpty text="등록된 공지사항이 없습니다." />
      ) : (
        notices.map((n) => {
          const open = openId === n.id;
          return (
            <MobileCard key={n.id} className="!p-0 overflow-hidden">
              <button type="button" onClick={() => setOpenId(open ? null : n.id)} className="w-full text-left p-4 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${open ? "" : "truncate"}`}>{n.title}</p>
                  <p className="text-xs text-text-muted mt-1">
                    {n.author_name} · {shortDate(n.created_at)}
                  </p>
                </div>
                {open ? <ChevronUp size={18} className="text-text-muted shrink-0" /> : <ChevronDown size={18} className="text-text-muted shrink-0" />}
              </button>
              {open && <div className="px-4 pb-4 text-sm leading-relaxed whitespace-pre-wrap break-words border-t border-border pt-3">{n.content}</div>}
            </MobileCard>
          );
        })
      )}
    </MobileLayout>
  );
}
