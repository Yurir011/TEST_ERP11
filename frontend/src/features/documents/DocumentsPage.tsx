import { Download, FileText } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet, apiPost, downloadFile } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { DOC_TYPE_LABELS, type DocumentRecord, type DocumentType } from "./types";

export function DocumentsPage() {
  const [docType, setDocType] = useState<DocumentType>("employment");
  const [purpose, setPurpose] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<DocumentRecord[] | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  function loadHistory() {
    apiGet<DocumentRecord[]>("/api/documents/me")
      .then(setHistory)
      .catch((err) => {
        logError("Documents", "발급 이력 조회 실패", err);
        setHistory([]);
      });
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleDownload(record: DocumentRecord) {
    setDownloadingId(record.id);
    try {
      const filename = `${DOC_TYPE_LABELS[record.doc_type]}_${record.issued_at.slice(0, 10)}.pdf`;
      await downloadFile(`/api/documents/${record.id}/download`, filename);
    } catch (err) {
      logError("Documents", "다운로드 실패", err);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await apiPost<DocumentRecord>("/api/documents/issue", {
        doc_type: docType,
        purpose: purpose || null,
      });
      logDebug("Documents", `발급 완료: id=${created.id}`);
      loadHistory();
      await handleDownload(created);
      setPurpose("");
    } catch (err) {
      logError("Documents", "발급 실패", err);
      setError(err instanceof ApiError ? err.message : "발급 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title="재직증명서" description="재직증명서·경력증명서를 즉시 발급받습니다.">
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 mb-8 max-w-xl">
        <div>
          <label className="block text-xs text-text-muted mb-1.5">문서 종류</label>
          <div className="flex gap-2">
            {(Object.keys(DOC_TYPE_LABELS) as DocumentType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDocType(type)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  docType === type
                    ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                    : "border-border text-text-muted hover:bg-bg"
                }`}
              >
                <FileText size={15} />
                {DOC_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5">용도 (선택)</label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="예: 은행 제출용, 비자 신청용"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
        >
          {isSubmitting ? "발급 중..." : "발급하기 (PDF 자동 다운로드)"}
        </button>
      </form>

      <h2 className="text-sm font-medium text-text-muted mb-3">발급 이력</h2>
      {history === null && <p className="text-sm text-text-muted">불러오는 중...</p>}
      {history !== null && history.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <p className="text-sm text-text-muted">발급 이력이 없습니다.</p>
        </div>
      )}
      {history !== null && history.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
          {history.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium">{DOC_TYPE_LABELS[doc.doc_type]}</p>
                <p className="text-xs text-text-muted mt-1">
                  {formatDate(doc.issued_at)} {doc.purpose && `· ${doc.purpose}`}
                </p>
              </div>
              <button
                onClick={() => handleDownload(doc)}
                disabled={downloadingId === doc.id}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                <Download size={14} />
                {downloadingId === doc.id ? "다운로드 중..." : "재다운로드"}
              </button>
            </div>
          ))}
        </div>
      )}
    </MainLayout>
  );
}
