import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { logError } from "../../lib/logger";

export interface Approver {
  id: number;
  name: string;
  title: "team_lead" | "ceo";
}

const TITLE_LABELS: Record<Approver["title"], string> = {
  team_lead: "팀장",
  ceo: "대표",
};

export function ApproverSelect({
  value,
  onChange,
  label = "결재권자 선택",
}: {
  value: string;
  onChange: (approverId: string) => void;
  label?: string;
}) {
  const [approvers, setApprovers] = useState<Approver[] | null>(null);

  useEffect(() => {
    apiGet<Approver[]>("/api/users/approvers")
      .then(setApprovers)
      .catch((err) => logError("ApproverSelect", "결재권자 목록 조회 실패", err));
  }, []);

  return (
    <div>
      <label className="block text-xs text-text-muted mb-1.5">{label}</label>
      {approvers === null && <p className="text-xs text-text-muted">불러오는 중...</p>}
      {approvers !== null && approvers.length === 0 && (
        <p className="text-xs text-danger">결재권자(팀장/대표)로 지정된 직원이 없습니다.</p>
      )}
      {approvers !== null && approvers.length > 0 && (
        <select
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
        >
          <option value="" disabled>
            선택
          </option>
          {approvers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({TITLE_LABELS[a.title]})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
