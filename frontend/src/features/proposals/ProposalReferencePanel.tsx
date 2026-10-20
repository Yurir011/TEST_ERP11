import { ExternalLink, FileText, Paperclip, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, downloadFile, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { isViewableInBrowser } from "./ProposalAttachmentsModal";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_STYLES, PROPOSAL_TITLE_LABELS, type Proposal, type ProposalAttachment } from "./types";

/**
 * 발주서를 쓰면서 근거 품의서를 함께 볼 수 있는 오른쪽 참조 패널.
 * 화면을 덮는 팝업이 아니라 오른쪽에 붙는 패널이라, 열어 둔 채로 발주서 입력칸을 계속 채울 수 있다.
 */
export function ProposalReferencePanel({ proposal, onClose }: { proposal: Proposal; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function openPdf() {
    setError(null);
    logDebug("ProposalReference", `참조 품의서 PDF 열기: id=${proposal.id}`);
    openFile(`/api/proposals/${proposal.id}/pdf`).catch((err) => {
      logError("ProposalReference", "품의서 PDF 열기 실패", err);
      setError(err instanceof ApiError ? err.message : "품의서 PDF를 열지 못했습니다.");
    });
  }

  function openAttachment(a: ProposalAttachment) {
    setError(null);
    if (a.kind === "link" && a.url) {
      window.open(a.url, "_blank");
      return;
    }
    const path = `/api/proposals/${proposal.id}/attachments/${a.id}/file`;
    const run = isViewableInBrowser(a.label) ? openFile(path) : downloadFile(path, a.label);
    run.catch((err) => {
      logError("ProposalReference", "첨부 열기 실패", err);
      setError(err instanceof ApiError ? err.message : "파일을 열지 못했습니다.");
    });
  }

  return (
    <aside
      role="complementary"
      aria-label="참조 품의서"
      className="fixed right-0 top-0 z-40 flex h-full w-[min(440px,92vw)] flex-col border-l border-border bg-surface shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs text-text-muted">참조 품의서</p>
          <h2 className="mt-0.5 truncate text-base font-semibold" title={proposal.title}>
            {proposal.title}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`px-2 py-0.5 text-xs font-medium ${SOFT_BADGE.orange}`}>{proposal.kind ? `${proposal.kind}품의서` : "품의서"}</span>
            <span className={`px-2 py-0.5 text-xs font-medium ${PROPOSAL_STATUS_STYLES[proposal.status]}`}>{PROPOSAL_STATUS_LABELS[proposal.status]}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="참조 닫기" className="shrink-0 rounded p-1 text-text-muted hover:bg-bg hover:text-text">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
        <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-xs text-text-muted">문서번호</dt>
          <dd className="break-all">{proposal.doc_no}</dd>
          <dt className="text-xs text-text-muted">기안일자</dt>
          <dd>{proposal.issue_date}</dd>
          <dt className="text-xs text-text-muted">기안자</dt>
          <dd>
            {proposal.creator_name} · {proposal.department_name}
          </dd>
        </dl>

        <section>
          <p className="mb-1 text-xs text-text-muted">진행 내용</p>
          <p>아래와 같이 {proposal.topic}을 진행하고자 합니다.</p>
        </section>

        <section>
          <p className="mb-1 text-xs text-text-muted">내용</p>
          <div className="whitespace-pre-wrap break-words rounded-xl border border-border bg-bg px-3.5 py-3 leading-relaxed">{proposal.content || "-"}</div>
        </section>

        {proposal.steps.length > 0 || proposal.is_final_decision ? (
          <section>
            <p className="mb-1 text-xs text-text-muted">결재 현황</p>
            <ul className="space-y-1">
              {proposal.is_final_decision ? (
                <li className="rounded-lg bg-bg px-3 py-1.5">전결</li>
              ) : (
                proposal.steps.map((s) => (
                  <li key={s.step_order} className="flex items-center gap-2 rounded-lg bg-bg px-3 py-1.5">
                    <span className="text-xs text-text-muted">{PROPOSAL_TITLE_LABELS[s.title]}</span>
                    <span className="font-medium">{s.approver_name}</span>
                    <span className="ml-auto text-xs text-text-muted">{s.status === "approved" ? "승인" : s.status === "rejected" ? "반려" : "대기"}</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        <section>
          <p className="mb-1 text-xs text-text-muted">첨부 ({proposal.attachments.length})</p>
          {proposal.attachments.length === 0 ? (
            <p className="text-xs text-text-muted">첨부된 파일이 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {proposal.attachments.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => openAttachment(a)}
                    aria-label={`${a.label} 열기`}
                    className="flex w-full items-center gap-2 rounded-lg bg-bg px-3 py-1.5 text-left hover:text-primary"
                  >
                    {a.kind === "link" ? <ExternalLink size={13} className="shrink-0" /> : <Paperclip size={13} className="shrink-0" />}
                    <span className="truncate">{a.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={openPdf}
          disabled={!proposal.has_pdf}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FileText size={14} />
          품의서 PDF 열기
        </button>
        <button type="button" onClick={onClose} className="ml-auto rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-bg hover:text-text">
          닫기
        </button>
      </div>
    </aside>
  );
}
