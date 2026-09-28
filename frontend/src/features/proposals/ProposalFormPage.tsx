import { Link as LinkIcon, Paperclip, X } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApproverSelect } from "../../components/approval/ApproverSelect";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiPost, apiUpload } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { PROPOSAL_STEP_CHAINS, PROPOSAL_TITLE_LABELS, type Proposal, type ProposalApproverTitle } from "./types";

const DEPARTMENT_NAME = "연구개발팀";

type StagedAttachment = { kind: "file"; file: File } | { kind: "link"; url: string; label: string };

function todayLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ProposalFormPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [kind, setKind] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [startTitle, setStartTitle] = useState<ProposalApproverTitle | null>(null);
  const [approverIds, setApproverIds] = useState<string[]>(["", "", ""]);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chain = startTitle ? PROPOSAL_STEP_CHAINS[startTitle] : null;

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => [...prev, ...files.map((file) => ({ kind: "file" as const, file }))]);
    e.target.value = "";
  }

  function handleAddLink() {
    if (!linkUrl.trim()) return;
    setAttachments((prev) => [...prev, { kind: "link", url: linkUrl.trim(), label: linkLabel.trim() || linkUrl.trim() }]);
    setLinkUrl("");
    setLinkLabel("");
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleFirstApproverChange(approver: { title: ProposalApproverTitle } | undefined) {
    setStartTitle(approver ? approver.title : null);
    // 1단계 값은 onChange가 별도로 채우므로, 여기서는 이후 단계(2·3단계) 선택만 초기화한다.
    setApproverIds((prev) => [prev[0], "", ""]);
  }

  function setApproverIdAt(index: number, value: string) {
    setApproverIds((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startTitle || !chain) {
      setError("1단계 결재자를 먼저 선택해주세요.");
      return;
    }
    const selectedIds = chain.map((_, idx) => approverIds[idx]);
    if (selectedIds.some((id) => !id)) {
      setError("결재선의 모든 단계에서 결재자를 선택해주세요.");
      return;
    }

    logDebug("Proposals", `품의서 등록 시도: title=${title}, start_title=${startTitle}`);
    setIsSubmitting(true);
    try {
      const created = await apiPost<Proposal>("/api/proposals", {
        kind: kind.trim() || null,
        title,
        topic,
        content,
        start_title: startTitle,
        approver_ids: selectedIds.map(Number),
      });

      for (const attachment of attachments) {
        try {
          if (attachment.kind === "file") {
            await apiUpload(`/api/proposals/${created.id}/attachments/file`, attachment.file);
          } else {
            await apiPost(`/api/proposals/${created.id}/attachments/link`, {
              url: attachment.url,
              label: attachment.label,
            });
          }
        } catch (err) {
          logError("Proposals", "첨부 업로드 실패", err);
        }
      }

      navigate("/project-documents", { replace: true });
    } catch (err) {
      logError("Proposals", "품의서 등록 실패", err);
      setError(err instanceof ApiError ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title="품의서 작성" description="결재 승인이 완료되면 PDF가 자동으로 생성됩니다.">
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
        <div className="bg-surface border border-border rounded-2xl p-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-text-muted mb-1">기안자</p>
            <p className="font-medium">{user?.name}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">기안부서</p>
            <p className="font-medium">{DEPARTMENT_NAME}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">기안일자</p>
            <p className="font-medium">{todayLabel()}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">문서번호</p>
            <p className="font-medium text-text-muted">결재 요청 시 자동 발급</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">품의서 종류 (선택)</label>
            <input
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="예: 구매, 출장 (비워두면 그냥 '품의서'로 표시됩니다)"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">제목</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 신규 계측장비 구매의 건"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">내용 (본문 도입 문장)</label>
            <div className="flex items-center flex-wrap gap-1.5 text-sm bg-bg border border-border rounded-lg px-3 py-2.5">
              <span>1. 아래와 같이</span>
              <input
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="OO 진행"
                className="min-w-[140px] flex-1 rounded-md border border-border px-2 py-1 text-sm outline-none focus:border-primary bg-surface"
              />
              <span>을 진행하고자 하오니 검토하여 승인해 주십시오.</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">상세 내용</label>
            <textarea
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="품목, 사유, 예산, 구매처 등 자유롭게 기재해주세요."
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y"
            />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">첨부파일 · 링크</h3>
            <p className="text-xs text-text-muted">참고할 파일이나 링크를 첨부할 수 있습니다.</p>
          </div>

          {attachments.length > 0 && (
            <ul className="space-y-1.5">
              {attachments.map((a, idx) => (
                <li key={idx} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    {a.kind === "file" ? <Paperclip size={14} className="text-text-muted shrink-0" /> : <LinkIcon size={14} className="text-text-muted shrink-0" />}
                    <span className="truncate">{a.kind === "file" ? a.file.name : a.label}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="text-text-muted hover:text-danger shrink-0"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <label className="inline-flex items-center gap-1.5 text-xs text-primary cursor-pointer hover:opacity-80">
              <Paperclip size={13} />
              파일 추가
              <input type="file" multiple onChange={handleFileSelect} className="hidden" />
            </label>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs text-text-muted mb-1.5">링크 URL</label>
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-muted mb-1.5">링크 설명 (선택)</label>
              <input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="예: 참고 자료"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
            <button
              type="button"
              onClick={handleAddLink}
              className="rounded-lg border border-border text-sm text-text-muted px-4 py-2 hover:bg-bg transition-colors"
            >
              링크 추가
            </button>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">결재 요청</h3>
            <p className="text-xs text-text-muted">
              1단계 결재자를 선택하면 그 직책에 따라 다음 결재 단계(최종 대표까지)가 자동으로 정해집니다.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <ApproverSelect
              label="1. 결재자"
              includeDeptHead
              value={approverIds[0]}
              onChange={(value) => setApproverIdAt(0, value)}
              onApproverChange={handleFirstApproverChange}
            />
            {chain?.slice(1).map((stepTitle, idx) => (
              <ApproverSelect
                key={`${startTitle}-${idx + 1}`}
                label={`${idx + 2}. ${PROPOSAL_TITLE_LABELS[stepTitle]}`}
                onlyTitle={stepTitle}
                value={approverIds[idx + 1]}
                onChange={(value) => setApproverIdAt(idx + 1, value)}
              />
            ))}
          </div>

          {chain && startTitle && (
            <p className="text-xs text-text-muted">
              1단계 결재자 직책({PROPOSAL_TITLE_LABELS[startTitle]})에 따라 총 {chain.length}단계 결재로 진행됩니다.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? "요청 중..." : "결재 요청"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={isSubmitting}
            className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
          >
            취소
          </button>
        </div>
      </form>
    </MainLayout>
  );
}
