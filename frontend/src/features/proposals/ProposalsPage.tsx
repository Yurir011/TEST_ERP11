import { Check, FileSignature, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet, apiPut, downloadFile, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { ProposalDetailModal } from "./ProposalDetailModal";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_STYLES, PROPOSAL_TITLE_LABELS, type Proposal } from "./types";

function docTitle(p: Proposal): string {
  return p.kind ? `${p.kind}품의서` : "품의서";
}

function pdfFilename(p: Proposal): string {
  return `품의서_${p.issue_date}.pdf`;
}

export function ProposalsPage({ embedded = false }: { embedded?: boolean }) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [pendingForMe, setPendingForMe] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Proposal | null>(null);

  function loadProposals() {
    logDebug("Proposals", "목록 조회 시작");
    apiGet<Proposal[]>("/api/proposals")
      .then(setProposals)
      .catch((err) => {
        logError("Proposals", "목록 조회 실패", err);
        setError("품의서 목록을 불러오지 못했습니다.");
      });
  }

  function loadPendingForMe() {
    apiGet<Proposal[]>("/api/proposals?status=pending&approver_mine=true")
      .then(setPendingForMe)
      .catch((err) => logError("Proposals", "내 결재함 조회 실패", err));
  }

  useEffect(() => {
    loadProposals();
    loadPendingForMe();
  }, []);

  function reloadAll() {
    loadProposals();
    loadPendingForMe();
    setDetail(null);
  }

  async function handleApprove(p: Proposal) {
    if (!window.confirm(`"${docTitle(p)}" 문서를 결재 승인하시겠습니까?`)) return;
    logDebug("Proposals", `결재 승인 시도: id=${p.id}`);
    setBusyId(p.id);
    try {
      await apiPut(`/api/proposals/${p.id}/approve`);
      reloadAll();
    } catch (err) {
      logError("Proposals", "결재 승인 실패", err);
      setError(err instanceof ApiError ? err.message : "결재 승인 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(p: Proposal) {
    const reason = window.prompt("반려 사유를 입력해주세요.");
    if (!reason || !reason.trim()) return;
    logDebug("Proposals", `결재 반려 시도: id=${p.id}`);
    setBusyId(p.id);
    try {
      await apiPut(`/api/proposals/${p.id}/reject`, { reason: reason.trim() });
      reloadAll();
    } catch (err) {
      logError("Proposals", "결재 반려 실패", err);
      setError(err instanceof ApiError ? err.message : "결재 반려 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(p: Proposal) {
    setBusyId(p.id);
    try {
      await downloadFile(`/api/proposals/${p.id}/pdf`, pdfFilename(p));
    } catch (err) {
      logError("Proposals", "PDF 다운로드 실패", err);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePrint(p: Proposal) {
    try {
      await openFile(`/api/proposals/${p.id}/pdf`);
    } catch (err) {
      logError("Proposals", "PDF 출력 열기 실패", err);
    }
  }

  const content = (
    <>
      <div className="grid grid-cols-1 gap-4 mb-6">
        <Link
          to="/proposals/new"
          className="bg-surface border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors flex items-center gap-3"
        >
          <div className="p-2.5 rounded-xl bg-bg text-tile-orange-fg">
            <FileSignature size={18} />
          </div>
          <div>
            <p className="text-sm font-medium text-text">품의서 작성</p>
            <p className="text-xs text-text-muted mt-0.5">새 품의서 등록</p>
          </div>
        </Link>
      </div>

      {pendingForMe.length > 0 && (
        <div className="bg-surface border border-tile-blue-fg/30 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">내 결재함 - 승인 대기 중인 품의서 ({pendingForMe.length}건)</h2>
          <div className="space-y-2">
            {pendingForMe.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {docTitle(p)} · {p.title}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {p.creator_name} · {p.issue_date} · No. {p.doc_no}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(p)}
                    disabled={busyId === p.id}
                    className="flex items-center gap-1 text-xs text-success border border-success/30 rounded-lg px-3 py-1.5 hover:bg-success/10 disabled:opacity-50"
                  >
                    <Check size={14} />
                    승인
                  </button>
                  <button
                    onClick={() => handleReject(p)}
                    disabled={busyId === p.id}
                    className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-danger/10 disabled:opacity-50"
                  >
                    <X size={14} />
                    반려
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {proposals !== null && proposals.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <FileSignature className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">등록된 품의서가 없습니다.</p>
        </div>
      )}

      {proposals !== null && proposals.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2.5 px-4 font-medium">문서번호</th>
                <th className="py-2.5 px-4 font-medium">제목</th>
                <th className="py-2.5 px-4 font-medium">기안자</th>
                <th className="py-2.5 px-4 font-medium">기안일자</th>
                <th className="py-2.5 px-4 font-medium">상태</th>
                <th className="py-2.5 px-4 font-medium">현재 결재</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => {
                const currentStep = p.steps.find((s) => s.step_order === p.current_step);
                return (
                  <tr
                    key={p.id}
                    onClick={() => setDetail(p)}
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-bg/60"
                  >
                    <td className="py-2.5 px-4">{p.doc_no}</td>
                    <td className="py-2.5 px-4">
                      {docTitle(p)} · {p.title}
                    </td>
                    <td className="py-2.5 px-4">{p.creator_name}</td>
                    <td className="py-2.5 px-4">{p.issue_date}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${PROPOSAL_STATUS_STYLES[p.status]}`}>
                        {PROPOSAL_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {p.status === "pending" && currentStep
                        ? `${PROPOSAL_TITLE_LABELS[currentStep.title]} ${currentStep.approver_name}`
                        : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <ProposalDetailModal
          proposal={detail}
          isBusy={busyId === detail.id}
          onClose={() => setDetail(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onDownload={handleDownload}
          onPrint={handlePrint}
          onAttachmentsChanged={(updated) => {
            setDetail(updated);
            setProposals((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? prev);
          }}
        />
      )}
    </>
  );

  if (embedded) return content;

  return (
    <MainLayout title="품의서" description="품의서를 작성하고 결재선을 지정해 승인을 요청합니다.">
      {content}
    </MainLayout>
  );
}
