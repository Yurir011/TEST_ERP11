import { Megaphone, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { apiGet } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { Notice } from "./types";

export function NoticesPage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    logDebug("Notices", "목록 조회 시작");
    apiGet<Notice[]>("/api/notices")
      .then(setNotices)
      .catch((err) => {
        logError("Notices", "목록 조회 실패", err);
        setError("공지사항을 불러오지 못했습니다.");
      });
  }, []);

  return (
    <MainLayout
      title="공지사항"
      description="전 직원에게 전달되는 공지사항입니다."
      actions={
        user?.role === "admin" && (
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
      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {notices === null && !error && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {notices !== null && notices.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <Megaphone className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">등록된 공지사항이 없습니다.</p>
        </div>
      )}

      {notices !== null && notices.length > 0 && (
        <div className="space-y-3">
          {notices.map((notice) => (
            <Link
              key={notice.id}
              to={`/notices/${notice.id}`}
              className="block bg-surface border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-text">{notice.title}</h2>
                <span className="text-xs text-text-muted shrink-0 ml-4">{formatDate(notice.created_at)}</span>
              </div>
              <p className="text-sm text-text-muted mt-2 line-clamp-2">{notice.content}</p>
              <p className="text-xs text-text-muted mt-3">작성자: {notice.author_name}</p>
            </Link>
          ))}
        </div>
      )}
    </MainLayout>
  );
}
