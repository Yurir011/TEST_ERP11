import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { apiDelete, apiGet } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { Notice } from "./types";

export function NoticeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    logDebug("NoticeDetail", `상세 조회 시작: id=${id}`);
    apiGet<Notice>(`/api/notices/${id}`)
      .then(setNotice)
      .catch((err) => {
        logError("NoticeDetail", "상세 조회 실패", err);
        setError("공지사항을 찾을 수 없습니다.");
      });
  }, [id]);

  async function handleDelete() {
    if (!window.confirm("이 공지사항을 삭제할까요?")) return;
    setIsDeleting(true);
    try {
      await apiDelete(`/api/notices/${id}`);
      navigate("/notices", { replace: true });
    } catch (err) {
      logError("NoticeDetail", "삭제 실패", err);
      setError("삭제 중 오류가 발생했습니다.");
      setIsDeleting(false);
    }
  }

  return (
    <MainLayout title="공지사항">
      <Link to="/notices" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-4">
        <ArrowLeft size={16} />
        목록으로
      </Link>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!error && !notice && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {notice && (
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-semibold">{notice.title}</h1>
            {user?.role === "admin" && (
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/notices/${notice.id}/edit`}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5"
                >
                  <Pencil size={14} />
                  수정
                </Link>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-1 text-xs text-danger hover:opacity-80 border border-danger/30 rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-text-muted mt-2">
            {notice.author_name} · {formatDate(notice.created_at)}
            {notice.updated_at !== notice.created_at && ` (수정됨: ${formatDate(notice.updated_at)})`}
          </p>
          <div className="mt-5 text-sm text-text whitespace-pre-wrap leading-relaxed">{notice.content}</div>
        </div>
      )}
    </MainLayout>
  );
}
