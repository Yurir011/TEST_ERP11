import { Check, Download, FileText, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApprovalChainPicker, type ApprovalEndTitle } from "../../components/approval/ApprovalChainPicker";
import { MainLayout } from "../../components/layout/MainLayout";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ApiError, apiGet, apiPost, apiPut, downloadFile } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { useOpenTarget } from "../../lib/useOpenTarget";
import { DocumentDetailModal } from "./DocumentDetailModal";
import { DOC_TYPE_LABELS, type DocumentRecord, type DocumentType } from "./types";

interface DocumentsPageProps {
  embedded?: boolean;
}

export function DocumentsPage({ embedded = false }: DocumentsPageProps) {
  const [docType, setDocType] = useState<DocumentType>("employment");
  const [purpose, setPurpose] = useState("");
  const [endTitle, setEndTitle] = useState<ApprovalEndTitle | null>(null);
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<DocumentRecord[] | null>(null);
  const [pendingForMe, setPendingForMe] = useState<DocumentRecord[]>([]);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const openTargetId = useOpenTarget();
  const [detail, setDetail] = useState<DocumentRecord | null>(null);

  // 업무 알림(?open=문서ID)으로 들어오면 해당 신청 건의 상세 내용을 바로 연다. 승인/반려 이후에도 동일하다.
  useEffect(() => {
    if (openTargetId === null) return;
    logDebug("Documents", `알림에서 신청 상세 열기: id=${openTargetId}`);
    apiGet<DocumentRecord>(`/api/documents/${openTargetId}`)
      .then(setDetail)
      .catch((err) => logError("Documents", "신청 상세 조회 실패", err));
  }, [openTargetId]);

  function loadHistory() {
    apiGet<DocumentRecord[]>("/api/documents/me")
      .then(setHistory)
      .catch((err) => {
        logError("Documents", "발급 이력 조회 실패", err);
        setHistory([]);
      });
  }

  function loadPendingForMe() {
    apiGet<DocumentRecord[]>("/api/documents?status=pending&approver_mine=true")
      .then(setPendingForMe)
      .catch((err) => logError("Documents", "내 결재함 조회 실패", err));
  }

  useEffect(() => {
    loadHistory();
    loadPendingForMe();
  }, []);

  function reloadAll() {
    loadHistory();
    loadPendingForMe();
    setDetail(null);
  }

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
    if (!endTitle || approverIds.some((id) => !id)) {
      setError("결재선을 선택해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await apiPost<DocumentRecord>("/api/documents/request", {
        doc_type: docType,
        purpose: purpose || null,
        end_title: endTitle,
        approver_ids: approverIds.map(Number),
      });
      logDebug("Documents", `발급 신청 완료: id=${created.id}, status=${created.status}`);
      reloadAll();
      window.alert("결재 요청이 완료되었습니다.");
      if (created.status === "approved") {
        await handleDownload(created);
      }
      setPurpose("");
      setEndTitle(null);
      setApproverIds([]);
    } catch (err) {
      logError("Documents", "발급 신청 실패", err);
      setError(err instanceof ApiError ? err.message : "발급 신청 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApprove(id: number) {
    setBusyId(id);
    try {
      await apiPut(`/api/documents/${id}/approve`);
      reloadAll();
      window.alert("결재 승인되었습니다.");
    } catch (err) {
      logError("Documents", "결재 승인 실패", err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: number) {
    const reason = window.prompt("반려 사유를 입력해주세요.");
    if (!reason || !reason.trim()) return;
    setBusyId(id);
    try {
      await apiPut(`/api/documents/${id}/reject`, { reason: reason.trim() });
      reloadAll();
    } catch (err) {
      logError("Documents", "결재 반려 실패", err);
    } finally {
      setBusyId(null);
    }
  }

  const content = (
    <>
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
        <ApprovalChainPicker
          endTitle={endTitle}
          onEndTitleChange={setEndTitle}
          approverIds={approverIds}
          onApproverIdsChange={setApproverIds}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
        >
          {isSubmitting ? "신청 중..." : "결재 요청"}
        </button>
      </form>

      {pendingForMe.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-text-muted mb-3">내 결재함 - 승인 대기 중인 신청</h2>
          <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
            {pendingForMe.map((doc) => (
              <div
                key={doc.id}
                onClick={() => setDetail(doc)}
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-bg transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">
                    {doc.user_name} · {DOC_TYPE_LABELS[doc.doc_type]}
                  </p>
                  <p className="text-xs text-text-muted mt-1">{doc.purpose ?? "용도 미기재"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApprove(doc.id);
                    }}
                    disabled={busyId === doc.id}
                    className="flex items-center gap-1 text-xs text-success border border-success/30 rounded-lg px-3 py-1.5 hover:bg-tile-green disabled:opacity-50"
                  >
                    <Check size={14} />
                    승인
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReject(doc.id);
                    }}
                    disabled={busyId === doc.id}
                    className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
                  >
                    <X size={14} />
                    반려
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
              <div
                key={doc.id}
                onClick={() => setDetail(doc)}
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-bg transition-colors"
              >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{DOC_TYPE_LABELS[doc.doc_type]}</p>
                  <StatusBadge status={doc.status} />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  {formatDate(doc.issued_at)} {doc.purpose && `· ${doc.purpose}`}
                </p>
                {doc.approver_name && (
                  <p className="text-xs text-text-muted mt-0.5">
                    결재권자: {doc.approver_name}
                    {doc.is_final_decision && <span className="text-primary font-medium"> (전결)</span>}
                    {!doc.is_final_decision && doc.steps.length > 1 && (
                      <span> · {doc.current_step}/{doc.steps.length}단계</span>
                    )}
                  </p>
                )}
                {doc.status === "rejected" && doc.reject_reason && (
                  <p className="text-xs text-danger mt-0.5">반려 사유: {doc.reject_reason}</p>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(doc);
                }}
                disabled={!doc.has_pdf || downloadingId === doc.id}
                title={doc.has_pdf ? undefined : "결재 승인 후 다운로드할 수 있습니다."}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                <Download size={14} />
                {downloadingId === doc.id ? "다운로드 중..." : "다운로드"}
              </button>
            </div>
          ))}
        </div>
      )}
      {detail && (
        <DocumentDetailModal
          doc={detail}
          isBusy={busyId === detail.id}
          isDownloading={downloadingId === detail.id}
          onClose={() => setDetail(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onDownload={handleDownload}
        />
      )}
    </>
  );

  if (embedded) return content;

  return (
    <MainLayout title="증빙서류 발급" description="재직증명서·경력증명서를 결재권자 승인 후 발급받습니다.">
      {content}
    </MainLayout>
  );
}
