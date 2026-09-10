import { Building2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { apiGet } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { Client } from "./types";

export function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadClients(q: string) {
    logDebug("Clients", `목록 조회: q=${q}`);
    const path = q ? `/api/clients?q=${encodeURIComponent(q)}` : "/api/clients";
    apiGet<Client[]>(path)
      .then(setClients)
      .catch((err) => {
        logError("Clients", "목록 조회 실패", err);
        setError("거래처 목록을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    const timer = setTimeout(() => loadClients(query), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <MainLayout
      title="거래처관리"
      description="거래처 정보를 등록하고 관리합니다."
      actions={
        <Link
          to="/clients/new"
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          새 거래처 등록
        </Link>
      }
    >
      <div className="relative mb-5 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상호, 담당자, 사업자번호로 검색"
          className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary bg-surface"
        />
      </div>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {clients === null && !error && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {clients !== null && clients.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
          <Building2 className="mx-auto mb-2 text-text-muted" size={24} />
          <p className="text-sm text-text-muted">{query ? "검색 결과가 없습니다." : "등록된 거래처가 없습니다."}</p>
        </div>
      )}

      {clients !== null && clients.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {clients.map((client) => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              className="bg-surface border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors"
            >
              <h2 className="font-medium text-text">{client.name}</h2>
              <p className="text-xs text-text-muted mt-1">
                {client.biz_reg_no || "사업자번호 미등록"}
                {client.ceo_name && ` · 대표 ${client.ceo_name}`}
              </p>
              <div className="mt-3 text-sm text-text-muted space-y-0.5">
                {client.contact_name && <p>담당자: {client.contact_name}</p>}
                {client.contact_phone && <p>연락처: {client.contact_phone}</p>}
              </div>
              {(client.receivable_amount > 0 || client.payable_amount > 0) && (
                <div className="mt-3 flex gap-2 text-xs">
                  {client.receivable_amount > 0 && (
                    <span className="bg-red-50 text-danger px-2 py-1 rounded-full">
                      미수금 {formatCurrency(client.receivable_amount)}
                    </span>
                  )}
                  {client.payable_amount > 0 && (
                    <span className="bg-tile-blue text-tile-blue-fg px-2 py-1 rounded-full">
                      미지급금 {formatCurrency(client.payable_amount)}
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </MainLayout>
  );
}
