import { ChevronDown, ChevronUp, MapPin, Phone, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { Client } from "../clients/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

function PhoneLink({ number, label }: { number: string | null; label?: string }) {
  if (!number) return null;
  return (
    <a href={`tel:${number.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1 text-primary tabular-nums">
      <Phone size={13} />
      {label && <span className="text-text-muted text-xs">{label}</span>}
      {number}
    </a>
  );
}

export function MobileClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [showBank, setShowBank] = useState(false);

  useEffect(() => {
    logDebug("MobileClients", "거래처 목록 조회");
    apiGet<Client[]>("/api/clients")
      .then(setClients)
      .catch((err) => {
        logError("MobileClients", "거래처 목록 조회 실패", err);
        setClients([]);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients ?? [];
    return (clients ?? []).filter((c) =>
      [c.name, c.biz_reg_no, c.ceo_name, c.phone, ...c.contacts.map((ct) => ct.name)].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [clients, query]);

  function toggle(id: number) {
    setOpenId((cur) => (cur === id ? null : id));
    setShowBank(false);
  }

  return (
    <MobileLayout title="거래처 조회">
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상호, 사업자번호, 대표자, 담당자 검색"
          aria-label="거래처 검색"
          className="w-full rounded-xl border border-border pl-10 pr-3 py-3 text-base outline-none focus:border-primary bg-surface"
        />
      </div>

      {clients === null ? (
        <p className="text-xs text-text-muted text-center py-10">불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <MobileEmpty text={query ? "검색 결과가 없습니다." : "등록된 거래처가 없습니다."} />
      ) : (
        <>
          <p className="text-xs text-text-muted px-1">{filtered.length}곳</p>
          {filtered.map((c) => {
            const open = openId === c.id;
            return (
              <MobileCard key={c.id} className="!p-0 overflow-hidden">
                <button type="button" onClick={() => toggle(c.id)} className="w-full text-left p-4 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-text-muted mt-0.5 truncate">
                      {[c.ceo_name, c.biz_reg_no].filter(Boolean).join(" · ") || "-"}
                    </p>
                  </div>
                  {open ? <ChevronUp size={18} className="text-text-muted shrink-0" /> : <ChevronDown size={18} className="text-text-muted shrink-0" />}
                </button>

                {open && (
                  <div className="px-4 pb-4 pt-3 border-t border-border space-y-3 text-sm">
                    {c.phone && <PhoneLink number={c.phone} label="대표" />}
                    {c.address && (
                      <p className="flex items-start gap-1.5 text-text-muted">
                        <MapPin size={14} className="mt-0.5 shrink-0" />
                        <span className="break-words">{c.address}</span>
                      </p>
                    )}
                    {(c.biz_type || c.biz_class) && (
                      <p className="text-xs text-text-muted">
                        업태 {c.biz_type || "-"} · 종목 {c.biz_class || "-"}
                      </p>
                    )}

                    {c.contacts.length > 0 && (
                      <div className="space-y-2.5">
                        <p className="text-xs font-semibold text-text-muted">담당자</p>
                        {c.contacts.map((ct) => (
                          <div key={ct.id} className="bg-bg rounded-xl p-3 space-y-1">
                            <p className="font-medium">
                              {ct.name}
                              {ct.title && <span className="text-xs text-text-muted font-normal"> {ct.title}</span>}
                            </p>
                            <div className="flex flex-col gap-1 text-[13px]">
                              <PhoneLink number={ct.mobile_phone} label="휴대폰" />
                              <PhoneLink number={ct.landline_phone} label="유선" />
                              {ct.email && (
                                <a href={`mailto:${ct.email}`} className="text-primary break-all">
                                  {ct.email}
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {(c.bank_name || c.bank_account) && (
                      <div>
                        <button type="button" onClick={() => setShowBank((v) => !v)} className="text-xs text-text-muted underline">
                          {showBank ? "계좌 정보 숨기기" : "계좌 정보 보기"}
                        </button>
                        {showBank && (
                          <p className="mt-1.5 tabular-nums">
                            {c.bank_name} {c.bank_account}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </MobileCard>
            );
          })}
        </>
      )}
    </MobileLayout>
  );
}
