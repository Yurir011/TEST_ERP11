import { FileDown } from "lucide-react";
import type { ProjectDocument } from "./types";

interface QuotationLoaderProps {
  quotations: ProjectDocument[];
  value: string;
  onChange: (id: string) => void;
}

/** 거래명세서 작성 화면의 "승인된 견적서 불러오기(선택)" 영역 */
export function QuotationLoader({ quotations, value, onChange }: QuotationLoaderProps) {
  return (
    <div className="bg-tile-blue text-tile-blue-fg rounded-xl px-4 py-3">
      <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
        <FileDown size={14} />
        승인된 견적서 불러오기 (선택)
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-primary/30 px-3 py-2 text-sm outline-none focus:border-primary bg-surface text-text"
      >
        <option value="">불러올 견적서 선택</option>
        {quotations.map((q) => (
          <option key={q.id} value={q.id}>
            {q.doc_no ?? `#${q.id}`} · {q.project_name} ({q.client_name}) · {q.issue_date}
          </option>
        ))}
      </select>
      <p className="text-[11px] mt-1.5 opacity-80">
        날짜를 제외한 프로젝트·거래처·담당자·품목이 그대로 자동입력됩니다.
        {quotations.length === 0 && " (승인된 견적서가 아직 없습니다)"}
      </p>
    </div>
  );
}
