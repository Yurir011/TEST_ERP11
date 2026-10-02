export function FinalDecisionCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 text-sm cursor-pointer hover:bg-surface">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary mt-0.5"
      />
      <span>
        <span className="font-medium">전결로 처리</span>
        <span className="block text-xs text-text-muted mt-0.5">
          결재선 선택 없이 본인 결재로 즉시 승인을 완료합니다.
        </span>
      </span>
    </label>
  );
}
