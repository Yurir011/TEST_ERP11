import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { logError } from "../../lib/logger";

export interface Approver {
  id: number;
  name: string;
  title: "dept_head" | "team_lead" | "ceo";
}

const TITLE_LABELS: Record<Approver["title"], string> = {
  dept_head: "부서장",
  team_lead: "팀장",
  ceo: "대표",
};

export function ApproverSelect({
  value,
  onChange,
  label = "결재권자 선택",
  onlyTitle,
  includeDeptHead,
  onApproverChange,
}: {
  value: string;
  onChange: (approverId: string) => void;
  label?: string;
  /** 지정하면 해당 직책의 결재권자만 후보로 보여준다 (품의서 단계별 결재자 선택 등). */
  onlyTitle?: Approver["title"];
  /** onlyTitle 없이도 부서장을 후보에 포함할지 여부 (품의서 1단계 결재자 선택 등). */
  includeDeptHead?: boolean;
  /** 선택된 결재권자 전체 정보가 필요할 때 (예: 직책에 따라 다음 결재 단계를 정하는 경우) */
  onApproverChange?: (approver: Approver | undefined) => void;
}) {
  const [approvers, setApprovers] = useState<Approver[] | null>(null);
  const shouldIncludeDeptHead = includeDeptHead ?? onlyTitle === "dept_head";

  useEffect(() => {
    apiGet<Approver[]>(`/api/users/approvers${shouldIncludeDeptHead ? "?include_dept_head=true" : ""}`)
      .then(setApprovers)
      .catch((err) => logError("ApproverSelect", "결재권자 목록 조회 실패", err));
  }, [shouldIncludeDeptHead]);

  const candidates = approvers?.filter((a) => !onlyTitle || a.title === onlyTitle) ?? null;

  function handleChange(id: string) {
    onChange(id);
    onApproverChange?.(candidates?.find((a) => String(a.id) === id));
  }

  return (
    <div>
      <label className="block text-xs text-text-muted mb-1.5">{label}</label>
      {candidates === null && <p className="text-xs text-text-muted">불러오는 중...</p>}
      {candidates !== null && candidates.length === 0 && (
        <p className="text-xs text-danger">
          {onlyTitle ? `${TITLE_LABELS[onlyTitle]}로 지정된 직원이 없습니다.` : "결재권자로 지정된 직원이 없습니다."}
        </p>
      )}
      {candidates !== null && candidates.length > 0 && (
        <select
          required
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
        >
          <option value="" disabled>
            선택
          </option>
          {candidates.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({TITLE_LABELS[a.title]})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
