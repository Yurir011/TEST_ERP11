const TITLE_LABELS: Record<string, string> = { dept_head: "부서장", team_lead: "팀장", ceo: "대표" };

interface StampStep {
  step_order: number;
  title: string;
  approver_name: string;
  status: "pending" | "approved" | "rejected";
  decided_at: string | null;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 결재 문서처럼 직책별 결재란(칸)에 승인 도장과 일자를 찍어 보여준다. 전체 결재선 중 어디까지 완료됐는지 한눈에 확인한다. */
export function ApprovalStampTable({
  steps,
  currentStep,
  docStatus,
}: {
  steps: StampStep[];
  currentStep: number;
  docStatus: string;
}) {
  if (steps.length === 0) return null;
  const doneCount = steps.filter((s) => s.status === "approved").length;

  return (
    <div className="mb-4">
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((step) => (
            <div key={`h-${step.step_order}`} className="bg-bg text-center text-[11px] font-semibold text-text-muted py-1.5 border-b border-border">
              {TITLE_LABELS[step.title] ?? step.title}
            </div>
          ))}
          {steps.map((step) => {
            const isCurrent = step.step_order === currentStep && docStatus === "pending";
            return (
              <div
                key={`b-${step.step_order}`}
                className={`text-center py-3 px-1 min-h-[88px] flex flex-col items-center justify-center border-l border-border first:border-l-0 ${
                  isCurrent ? "bg-tile-blue" : ""
                }`}
              >
                {step.status === "approved" ? (
                  <>
                    <span className="inline-flex items-center justify-center w-11 h-11 rounded-full border-2 border-danger/70 text-danger text-xs font-bold -rotate-6">
                      승인
                    </span>
                    <p className="text-xs font-medium mt-1.5">{step.approver_name}</p>
                    <p className="text-[10px] text-text-muted">{shortDate(step.decided_at)}</p>
                  </>
                ) : step.status === "rejected" ? (
                  <>
                    <span className="inline-flex items-center justify-center w-11 h-11 rounded-full border-2 border-text-muted text-text-muted text-xs font-bold">
                      반려
                    </span>
                    <p className="text-xs font-medium mt-1.5">{step.approver_name}</p>
                    <p className="text-[10px] text-text-muted">{shortDate(step.decided_at)}</p>
                  </>
                ) : (
                  <>
                    <p className={`text-xs ${isCurrent ? "text-tile-blue-fg font-semibold" : "text-text-muted"}`}>
                      {isCurrent ? "결재 대기" : "(대기)"}
                    </p>
                    <p className="text-[11px] text-text-muted mt-1">{step.approver_name}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-text-muted mt-1.5 text-right">
        완료 {doneCount} / 전체 {steps.length}
      </p>
    </div>
  );
}
