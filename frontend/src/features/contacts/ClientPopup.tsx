import { Phone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { apiGet } from "../../lib/api";
import { hasMenuPermission } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { telHref, type ClientSummary } from "./types";

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm py-1.5">
      <span className="w-14 shrink-0 text-xs text-text-muted pt-0.5">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

/** 연락처의 회사명을 누르면 뜨는 거래처 팝업. 금액·계좌 정보 없이 연락에 필요한 내용만 보여 준다 (PC·모바일 공용). */
export function ClientPopup({ clientId, onClose }: { clientId: number; onClose: () => void }) {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canOpenDetail = hasMenuPermission(user, "clients") && user?.role !== "site_admin";

  useEffect(() => {
    logDebug("Contacts", `거래처 팝업 조회: client_id=${clientId}`);
    apiGet<ClientSummary>(`/api/contacts/clients/${clientId}`)
      .then(setClient)
      .catch((err) => {
        logError("Contacts", "거래처 팝업 조회 실패", err);
        setError("거래처 정보를 불러오지 못했습니다.");
      });
  }, [clientId]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div role="dialog" aria-label="거래처 정보" className="bg-surface rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-base font-semibold break-words">{client?.name ?? "거래처"}</h3>
          <button type="button" onClick={onClose} className="p-1 -m-1 text-text-muted hover:text-text" aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {!error && !client && <p className="text-sm text-text-muted">불러오는 중...</p>}
        {client && (
          <>
            <div className="border-b border-border pb-2">
              <Row label="대표자" value={client.ceo_name} />
              <Row label="업태/종목" value={[client.biz_type, client.biz_class].filter(Boolean).join(" / ") || null} />
              {client.phone && (
                <div className="flex gap-3 text-sm py-1.5">
                  <span className="w-14 shrink-0 text-xs text-text-muted pt-0.5">대표전화</span>
                  <a href={telHref(client.phone)} className="text-primary tabular-nums inline-flex items-center gap-1">
                    <Phone size={13} />
                    {client.phone}
                  </a>
                </div>
              )}
              <Row label="이메일" value={client.email} />
              <Row label="주소" value={client.address} />
            </div>
            <div className="pt-3">
              <p className="text-xs text-text-muted mb-2">담당자 {client.contacts.length > 0 && `(${client.contacts.length})`}</p>
              {client.contacts.length === 0 ? (
                <p className="text-sm text-text-muted">등록된 담당자가 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {client.contacts.map((c, i) => (
                    <li key={i} className="bg-bg rounded-xl p-3 text-sm">
                      <p className="font-medium">
                        {c.name}
                        {c.title && <span className="text-text-muted font-normal"> · {c.title}</span>}
                      </p>
                      <div className="flex flex-col gap-0.5 mt-1 text-[13px]">
                        {c.mobile_phone && (
                          <a href={telHref(c.mobile_phone)} className="text-primary tabular-nums">
                            <span className="text-text-muted text-xs">휴대폰 </span>
                            {c.mobile_phone}
                          </a>
                        )}
                        {c.landline_phone && (
                          <a href={telHref(c.landline_phone)} className="text-primary tabular-nums">
                            <span className="text-text-muted text-xs">유선 </span>
                            {c.landline_phone}
                          </a>
                        )}
                        {c.email && <span className="text-text-muted break-all">{c.email}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {canOpenDetail && (
              <Link to={`/clients/${client.id}`} className="block text-center text-xs text-primary mt-4">
                거래처관리에서 자세히 보기
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
