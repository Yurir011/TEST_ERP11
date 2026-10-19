import { Check, FileSignature, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { apiGet, downloadFile, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { useOpenTarget, type OpenOverlayProps } from "../../lib/useOpenTarget";
import { CLAMP_CELL, ClampText } from "../../components/ui/ClampText";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { ProposalDetailModal } from "./ProposalDetailModal";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_STYLES, PROPOSAL_TITLE_LABELS, type Proposal } from "./types";
import { useApprovalActions } from "../../lib/useApprovalActions";

function docTitle(p: Proposal): string {
  return p.kind ? `${p.kind}품의서` : "품의서";
}

function pdfFilename(p: Proposal): string {
  return `품의서_${p.issue_date}.pdf`;
}

export function ProposalsPage({
  embedded = false,
  openId,
  modalOnly = false,
  onDecided,
  onModalClose,
}: { embedded?: boolean } & OpenOverlayProps) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [pendingForMe, setPendingForMe] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Proposal | null>(null);
  const openTargetId = useOpenTarget(openId);
  const [openedTarget, setOpenedTarget] = useState(false);

  // 업무 알림(?open=품의서ID)으로 들어오면 목록을 받은 뒤 해당 품의서 상세를 한 번 연다 (렌더 중 조정: 효과로 한 번 더 그리지 않는다).
  if (openTargetId !== null && !openedTarget && proposals !== null) {
    const target = proposals.find((p) => p.id === openTargetId) ?? pendingForMe.find((p) => p.id === openTargetId);
    if (target) {
      setOpenedTarget(true);
      logDebug("Proposals", `알림에서 품의서 상세 열기: id=${openTargetId}`);
      setDetail(target);
    }
  }

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

  const { approve: handleApprove, reject: handleReject } = useApprovalActions<Proposal>({
    module: "Proposals",
    getId: (p) => p.id,
    basePath: (id) => `/api/proposals/${id}`,
    confirmApprove: (p) => `"${docTitle(p)}" 문서를 결재 승인하시겠습니까?`,
    setBusyId,
    onDone: () => reloadAll(),
    onAfter: () => onDecided?.(),
    onError: setError,
  });

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

  const detailModal = detail && (
    <ProposalDetailModal
      proposal={detail}
      isBusy={busyId === detail.id}
      onClose={() => {
        setDetail(null);
        onModalClose?.();
      }}
      onApprove={handleApprove}
      onReject={handleReject}
      onDownload={handleDownload}
      onPrint={handlePrint}
      onDeleted={reloadAll}
      onAttachmentsChanged={(updated) => {
        setDetail(updated);
        setProposals((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? prev);
      }}
    />
  );

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
                <th className="py-2.5 px-4 font-medium w-[45%]">제목</th>
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
                    <td className={`py-2.5 px-4 ${CLAMP_CELL}`}>
                      <ClampText>{`${docTitle(p)} · ${p.title}`}</ClampText>
                    </td>
                    <td className="py-2.5 px-4">{p.creator_name}</td>
                    <td className="py-2.5 px-4">{p.issue_date}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-xs px-2 py-1 font-medium ${PROPOSAL_STATUS_STYLES[p.status]}`}>
                        {PROPOSAL_STATUS_LABELS[p.status]}
                      </span>
                      {p.is_final_decision && p.status === "approved" && (
                        <span className={`ml-1.5 text-xs px-2 py-1 font-medium ${SOFT_BADGE.purple}`}>전결</span>
                      )}
                      {p.delete_requested && (
                        <span className="ml-1.5 text-xs px-2 py-1 font-medium text-danger bg-danger/10 rounded-md">삭제 결재 중</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {p.is_final_decision
                        ? "전결"
                        : p.status === "pending" && currentStep
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

      {detailModal}
    </>
  );

  if (modalOnly) return detailModal;

  if (embedded) return content;

  return (
    <MainLayout title="품의서" description="품의서를 작성하고 결재선을 지정해 승인을 요청합니다.">
      {content}
    </MainLayout>
  );
}
