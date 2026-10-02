import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { ApproverSelect, type Approver } from "./ApproverSelect";

export type ApprovalEndTitle = "dept_head" | "team_lead" | "ceo";

const END_TITLE_OPTIONS: { value: ApprovalEndTitle; label: string }[] = [
  { value: "dept_head", label: "부서장" },
  { value: "team_lead", label: "팀장" },
  { value: "ceo", label: "대표" },
];

// 결재선은 항상 부서장에서 시작해, 선택한 종료 단계까지의 앞부분(prefix)으로 구성된다.
const CHAIN_TITLES: Record<ApprovalEndTitle, ApprovalEndTitle[]> = {
  dept_head: ["dept_head"],
  team_lead: ["dept_head", "team_lead"],
  ceo: ["dept_head", "team_lead", "ceo"],
};

const TITLE_LABELS: Record<ApprovalEndTitle, string> = { dept_head: "부서장", team_lead: "팀장", ceo: "대표" };

interface ApprovalChainPickerProps {
  endTitle: ApprovalEndTitle | null;
  onEndTitleChange: (title: ApprovalEndTitle) => void;
  approverIds: string[];
  onApproverIdsChange: (ids: string[]) => void;
}

/** "어느 단계(부서장/팀장/대표)에서 결재를 마무리할지"를 먼저 고르고, 그 단계까지의 결재자를
 * 순서대로 선택하는 공용 결재선 선택 UI. 연차·증빙서류·문서관리·품의서에서 공통으로 쓴다. */
export function ApprovalChainPicker({ endTitle, onEndTitleChange, approverIds, onApproverIdsChange }: ApprovalChainPickerProps) {
  // 해당 직책으로 지정된 직원이 있는 단계만 결재선에 포함한다 (서버의 build_chain_titles와 같은 규칙).
  const [staffedTitles, setStaffedTitles] = useState<Set<ApprovalEndTitle> | null>(null);

  useEffect(() => {
    logDebug("ApprovalChainPicker", "결재권자 직책 목록 조회 시작");
    apiGet<Approver[]>("/api/users/approvers?include_dept_head=true")
      .then((list) => setStaffedTitles(new Set(list.map((a) => a.title))))
      .catch((err) => logError("ApprovalChainPicker", "결재권자 직책 목록 조회 실패", err));
  }, []);

  function chainFor(value: ApprovalEndTitle) {
    const full = CHAIN_TITLES[value];
    return staffedTitles ? full.filter((t) => staffedTitles.has(t)) : full;
  }

  const chain = endTitle ? chainFor(endTitle) : [];

  function handleEndTitleClick(value: ApprovalEndTitle) {
    onEndTitleChange(value);
    const nextLength = chainFor(value).length;
    onApproverIdsChange(Array.from({ length: nextLength }, (_, i) => approverIds[i] ?? ""));
  }

  const gridColsClass = chain.length === 1 ? "grid-cols-1" : chain.length === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-text-muted mb-1.5">결재선 종료 단계</label>
        <div className="grid grid-cols-3 gap-2">
          {END_TITLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleEndTitleClick(opt.value)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                endTitle === opt.value
                  ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                  : "border-border text-text-muted hover:bg-bg"
              }`}
            >
              {opt.label}에서 종료
            </button>
          ))}
        </div>
      </div>

      {endTitle && (
        <div>
          <div className={`grid gap-3 ${gridColsClass}`}>
            {chain.map((stepTitle, idx) => (
              <ApproverSelect
                key={`${endTitle}-${idx}`}
                label={`${idx + 1}. ${TITLE_LABELS[stepTitle]}`}
                onlyTitle={stepTitle}
                value={approverIds[idx] ?? ""}
                onChange={(value) => {
                  const next = [...approverIds];
                  next[idx] = value;
                  onApproverIdsChange(next);
                }}
              />
            ))}
          </div>
          <p className="text-[11px] text-text-muted mt-1.5">
            {chain.length === 0
              ? "지정된 결재자가 없어 결재선을 만들 수 없습니다."
              : `${chain.map((t) => TITLE_LABELS[t]).join(" → ")} 순서로 ${chain.length}단계를 거쳐 결재가 마무리됩니다. (지정된 직원이 없는 직책은 건너뜁니다)`}
          </p>
        </div>
      )}
    </div>
  );
}
