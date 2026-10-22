import { Link as LinkIcon, Paperclip, X } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApprovalChainPicker, type ApprovalEndTitle } from "../../components/approval/ApprovalChainPicker";
import { FinalDecisionCheckbox } from "../../components/approval/FinalDecisionCheckbox";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiGet, apiPost, apiPut, apiUpload } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { PURCHASE_KIND } from "./purchaseFlow";
import { PROJECT_STATUS_LABELS, type Project } from "../projects/types";
import { ClientCombobox } from "../../components/ui/ClientCombobox";
import type { Client } from "../clients/types";
import type { Proposal } from "./types";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { objectParticle } from "../../lib/korean";

const DEPARTMENT_NAME = "연구개발팀";

type StagedAttachment = { kind: "file"; file: File } | { kind: "link"; url: string; label: string };

function todayLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ProposalFormPage() {
  const { notify } = useDialog();
  const { user } = useAuth();
  const navigate = useNavigate();
  // ?edit=품의서ID 이면 기존 품의서를 수정한다. 반려/승인된 품의서를 고친 뒤 저장하면 결재를 처음부터 다시 받는다.
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const isEdit = editId !== null;
  // ?copy=품의서ID 이면 그 품의서의 내용을 그대로 가져와 새 품의서로 쓴다 (같은 소모품을 또 살 때). 날짜는 오늘, 문서번호는 결재 요청 때 새로 발급된다.
  const copyId = searchParams.get("copy");
  const isCopy = !isEdit && copyId !== null;

  const [issueDate, setIssueDate] = useState(todayLabel());
  // 품의서 종류: 왼쪽 콤보박스(구매 / 일반) + 오른쪽 입력칸. 구매는 입력칸이 꺼지고, 일반은 종류 이름(예: 출장, 행사)을 적을 수 있다.
  const [kindMode, setKindMode] = useState<"구매" | "일반">("일반");
  const [kindText, setKindText] = useState("");
  const kind = kindMode === "구매" ? PURCHASE_KIND : kindText.trim(); // 서버에 저장하는 종류 (일반이고 비워 두면 빈 값 = 그냥 '품의서')
  function applyKind(value: string | null) {
    if (value === PURCHASE_KIND) {
      setKindMode("구매");
      setKindText("");
    } else {
      setKindMode("일반");
      setKindText(value ?? "");
    }
  }
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [vendorName, setVendorName] = useState("");
  // 속한 프로젝트 ("" = 일반: 프로젝트와 상관없는 구매, 예: 사무용품). 기본은 일반.
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]); // 거래처명 검색(자동완성)용 등록 거래처
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"KRW" | "USD" | "JPY">("KRW");
  const [endTitle, setEndTitle] = useState<ApprovalEndTitle | null>(null);
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [isFinalDecision, setIsFinalDecision] = useState(false);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const isPurchase = kindMode === "구매";
  // 구매를 고르면 본문 도입 문장의 진행 내용을 "구매"로 채우고, 일반으로 바꾸면 그 자동 입력만 지운다.
  function changeKindMode(next: "구매" | "일반") {
    setKindMode(next);
    if (next === "구매") setTopic((t) => (t.trim() === "" ? PURCHASE_KIND : t));
    else setTopic((t) => (t === PURCHASE_KIND ? "" : t));
  }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCopy) return;
    logDebug("Proposals", `복사해서 작성: source_id=${copyId}`);
    apiGet<Proposal[]>("/api/proposals")
      .then((list) => {
        const source = list.find((p) => String(p.id) === copyId);
        if (!source) {
          setError("복사할 품의서를 찾을 수 없습니다.");
          return;
        }
        // 기안일자는 오늘 그대로 두고, 결재선·첨부는 새로 정한다.
        applyKind(source.kind);
        setTitle(source.title);
        setTopic(source.topic);
        setContent(source.content);
        setVendorName(source.vendor_name ?? "");
        setProjectId(source.project_id ? String(source.project_id) : "");
        setAmount(source.amount === null || source.amount === undefined ? "" : String(source.amount));
        setCurrency(source.currency ?? "KRW");
      })
      .catch((err) => {
        logError("Proposals", "복사할 품의서 불러오기 실패", err);
        setError("복사할 품의서를 불러오지 못했습니다.");
      });
    // 화면이 열릴 때 한 번만 불러온다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    logDebug("Proposals", `수정 불러오기: id=${editId}`);
    apiGet<Proposal[]>("/api/proposals")
      .then((list) => {
        const target = list.find((p) => String(p.id) === editId);
        if (!target) {
          setError("수정할 품의서를 찾을 수 없습니다.");
          return;
        }
        if (target.status === "pending" || target.delete_requested || target.created_by !== user?.id) {
          setError("결재 대기 중이거나 삭제 결재가 진행 중인 품의서, 또는 다른 사람이 작성한 품의서는 수정할 수 없습니다.");
          return;
        }
        setIssueDate(target.issue_date);
        applyKind(target.kind);
        setTitle(target.title);
        setTopic(target.topic);
        setContent(target.content);
        setVendorName(target.vendor_name ?? "");
        setProjectId(target.project_id ? String(target.project_id) : "");
        setAmount(target.amount === null || target.amount === undefined ? "" : String(target.amount));
        setCurrency(target.currency ?? "KRW");
      })
      .catch((err) => {
        logError("Proposals", "수정 불러오기 실패", err);
        setError("수정할 품의서를 불러오지 못했습니다.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editId, user?.id]);

  // 진행 중인 프로젝트 목록 (프로젝트 관리). 수정 중인 품의서가 이미 고른 프로젝트는 끝났더라도 목록에 남긴다.
  useEffect(() => {
    apiGet<Project[]>("/api/projects")
      .then((list) => setProjects(list.filter((p) => (p.status !== "completed" && p.status !== "discarded") || String(p.id) === projectId)))
      .catch((err) => logError("Proposals", "프로젝트 목록 조회 실패", err));
    // 화면이 열릴 때와 수정 불러오기로 선택값이 정해질 때 한 번씩 다시 조회한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, isCopy]);

  // 거래처 검색: 등록된 거래처를 불러온다. 등록되지 않은 거래처는 이름을 직접 입력할 수 있다.
  useEffect(() => {
    apiGet<Client[]>("/api/clients")
      .then(setClients)
      .catch((err) => logError("Proposals", "거래처 목록 조회 실패", err));
  }, []);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isFinalDecision && (!endTitle || approverIds.some((id) => !id))) {
      setError("결재선을 선택하거나 전결을 선택해주세요.");
      return;
    }

    logDebug("Proposals", `품의서 등록 시도: title=${title}, end_title=${endTitle}, is_final_decision=${isFinalDecision}`);
    setIsSubmitting(true);
    try {
      const body = {
        issue_date: issueDate || todayLabel(),
        kind: kind || null,
        title,
        topic,
        content,
        vendor_name: isPurchase ? vendorName.trim() || null : null,
        project_id: projectId ? Number(projectId) : null,
        amount: isPurchase && amount.trim() !== "" ? Number(amount) : null,
        currency,
        is_final_decision: isFinalDecision,
        end_title: isFinalDecision ? null : endTitle,
        approver_ids: isFinalDecision ? [] : approverIds.map(Number),
      };
      const created = isEdit
        ? await apiPut<Proposal>(`/api/proposals/${editId}`, body)
        : await apiPost<Proposal>("/api/proposals", body);

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

      notify(isEdit ? "수정 후 결재 요청이 완료되었습니다." : "결재 요청이 완료되었습니다.");
      navigate("/project-documents", { replace: true });
    } catch (err) {
      logError("Proposals", "품의서 등록 실패", err);
      setError(err instanceof ApiError ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout
      showBack
      title={isEdit ? "품의서 수정" : isCopy ? "품의서 복사해서 작성" : "품의서 작성"}
      description={
        isEdit
          ? "수정한 뒤 결재를 처음부터 다시 받아야 합니다."
          : isCopy
            ? "기존 품의서의 내용을 가져왔습니다. 기안일자는 오늘이고 문서번호는 결재 요청 때 새로 발급됩니다. 결재선을 선택해 주세요."
            : "결재 승인이 완료되면 PDF가 자동으로 생성됩니다."
      }
    >
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
            <input
              type="date"
              required
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="rounded-lg border border-border px-2 py-1 text-sm font-medium outline-none focus:border-primary bg-bg"
            />
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">문서번호</p>
            <p className="font-medium text-text-muted">결재 요청 시 자동 발급</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5" htmlFor="proposal-kind">
              품의서 종류
            </label>
            <div className="flex gap-2">
              <select
                id="proposal-kind"
                value={kindMode}
                onChange={(e) => changeKindMode(e.target.value as "구매" | "일반")}
                className="w-32 shrink-0 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              >
                <option value="구매">구매</option>
                <option value="일반">일반</option>
              </select>
              <input
                aria-label="품의서 종류 내용"
                value={isPurchase ? "" : kindText}
                onChange={(e) => (e.target.value.trim() === PURCHASE_KIND ? changeKindMode("구매") : setKindText(e.target.value))} // '구매'를 직접 적으면 구매로 바뀐다
                disabled={isPurchase}
                maxLength={50}
                placeholder={isPurchase ? "구매는 입력하지 않습니다" : "예: 출장, 행사 (비워두면 그냥 '품의서'로 표시됩니다)"}
                className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg disabled:cursor-not-allowed disabled:bg-border/40 disabled:text-text-muted"
              />
            </div>
            {isPurchase && (
              <p className="text-xs text-text-muted mt-1.5">
                구매 품의서는 결재 승인 후 발주서 작성, 발송 확인, 입고 확인, 서류 첨부까지 목록의 카드 한 장에서 이어서 관리됩니다.
              </p>
            )}
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
            <label className="block text-xs text-text-muted mb-1.5" htmlFor="proposal-project">
              프로젝트
            </label>
            <select
              id="proposal-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            >
              <option value="">일반 (프로젝트와 상관없는 구매)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.client_name} ({PROJECT_STATUS_LABELS[p.status]})
                </option>
              ))}
            </select>
          </div>

          {isPurchase && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5" htmlFor="proposal-vendor">
                거래처명{isPurchase ? "" : " (선택)"}
              </label>
              <ClientCombobox id="proposal-vendor" required={isPurchase} value={vendorName} onChange={setVendorName} clients={clients} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5" htmlFor="proposal-amount">
                금액{isPurchase ? " (부가세 별도)" : " (선택)"}
              </label>
              <div className="flex gap-2">
                <select
                  aria-label="통화"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "KRW" | "USD" | "JPY")}
                  className="rounded-lg border border-border px-2 py-2 text-sm outline-none focus:border-primary bg-bg"
                >
                  <option value="KRW">원 (₩)</option>
                  <option value="USD">달러 ($)</option>
                  <option value="JPY">엔 (¥)</option>
                </select>
                <input
                  id="proposal-amount"
                  type="number"
                  min={0}
                  step="any"
                  required={isPurchase}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm text-right tabular-nums outline-none focus:border-primary bg-bg"
                />
              </div>
            </div>
          </div>
          )}
          {isPurchase && <p className="-mt-2 text-xs text-text-muted">여기에 적은 제목·거래처·금액·프로젝트는 발주서를 만들 때 그대로 이어받습니다.</p>}

          <div>
            <label className="block text-xs text-text-muted mb-1.5">내용 (본문 도입 문장)</label>
            <div className="flex items-center flex-wrap gap-1.5 text-sm bg-bg border border-border rounded-lg px-3 py-2.5">
              <span>1. 아래와 같이</span>
              <input
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={isPurchase ? "구매" : "OO 진행"}
                className="min-w-[140px] flex-1 rounded-md border border-border px-2 py-1 text-sm outline-none focus:border-primary bg-surface"
              />
              <span>{objectParticle(topic)} 진행하고자 하오니 검토하여 승인해 주십시오.</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5" htmlFor="proposal-content">
              {isPurchase ? "상세 내용 (선택 · 품목·사유 등 참고 사항)" : "구체적인 내용"}
            </label>
            <textarea
              id="proposal-content"
              required={!isPurchase}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={isPurchase ? 5 : 10}
              placeholder={isPurchase ? "품목, 사유 등 참고할 내용을 적어주세요. (없으면 비워둬도 됩니다)" : "품의하려는 내용을 구체적으로 기록해주세요. (목적, 일정, 예산, 담당 등)"}
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
            <p className="text-xs text-text-muted">결재선을 어느 단계에서 마무리할지 먼저 선택해주세요.</p>
          </div>

          <FinalDecisionCheckbox checked={isFinalDecision} onChange={setIsFinalDecision} />

          {!isFinalDecision && (
            <ApprovalChainPicker
              endTitle={endTitle}
              onEndTitleChange={setEndTitle}
              approverIds={approverIds}
              onApproverIdsChange={setApproverIds}
            />
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
