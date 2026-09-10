import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { Notice } from "./types";

export function NoticeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    logDebug("NoticeForm", `수정 대상 조회: id=${id}`);
    apiGet<Notice>(`/api/notices/${id}`)
      .then((notice) => {
        setTitle(notice.title);
        setContent(notice.content);
      })
      .catch((err) => {
        logError("NoticeForm", "조회 실패", err);
        setError("공지사항을 불러오지 못했습니다.");
      })
      .finally(() => setIsLoading(false));
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isEdit) {
        await apiPut(`/api/notices/${id}`, { title, content });
        navigate(`/notices/${id}`, { replace: true });
      } else {
        const created = await apiPost<Notice>("/api/notices", { title, content });
        navigate(`/notices/${created.id}`, { replace: true });
      }
    } catch (err) {
      logError("NoticeForm", "저장 실패", err);
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title={isEdit ? "공지사항 수정" : "새 공지사항 작성"}>
      {isLoading ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs text-text-muted mb-1.5" htmlFor="title">
              제목
            </label>
            <input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              placeholder="공지 제목을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5" htmlFor="content">
              내용
            </label>
            <textarea
              id="content"
              required
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y"
              placeholder="공지 내용을 입력하세요"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
            >
              {isSubmitting ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
            >
              취소
            </button>
          </div>
        </form>
      )}
    </MainLayout>
  );
}
