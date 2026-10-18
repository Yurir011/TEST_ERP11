import { Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { apiGet } from "../../lib/api";
import { logDebug } from "../../lib/logger";

interface MailLogRow {
  id: number;
  created_at: string;
  sender_name: string | null;
  to_addresses: string;
  subject: string;
}

const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 문서 상세에 보이는 메일 발송 이력 (참고용: 직원이 앱에서 보낸 직후 남긴 기록이라 증빙은 메일 서버의 보낸편지함이다). 기록이 없으면 아무것도 그리지 않는다 */
export function DocumentMailHistory({ docType, docId }: { docType: "project_document"; docId: number }) {
  const [rows, setRows] = useState<MailLogRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiGet<MailLogRow[]>(`/api/mail/logs?doc_type=${docType}&doc_id=${docId}`)
      .then((r) => !cancelled && setRows(r))
      .catch((err) => logDebug("Mail", `발송 이력 조회 실패: ${(err as Error).message}`));
    return () => {
      cancelled = true;
    };
  }, [docType, docId]);

  if (rows.length === 0) return null;
  return (
    <section className="mb-4" aria-label="메일 발송 이력">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <Mail size={13} /> 메일 발송 이력
      </h4>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id} className="text-xs bg-bg rounded-lg px-3 py-2">
            <p className="text-text-muted">
              {formatWhen(r.created_at)} · {r.sender_name ?? "(퇴사한 직원)"}
            </p>
            <p className="break-all">받는 사람: {r.to_addresses}</p>
            <p className="break-all text-text-muted">제목: {r.subject}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
