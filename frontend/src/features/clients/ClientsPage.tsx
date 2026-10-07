import { Building2, Download, FileText, Search, Trash2 } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { apiDelete, apiGet, downloadFile, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { NewClientButton } from "./NewClientButton";
import type { Client } from "./types";

function primaryContact(client: Client) {
  return client.contacts[0] ?? null;
}

function FileButton({ exists, label, onClick }: { exists: boolean; label: string; onClick: () => void }) {
  if (!exists) return <span className="text-text-muted">-</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} 보기`}
      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover border border-border rounded-lg px-2 py-1 hover:bg-bg"
    >
      <FileText size={13} />
      보기
    </button>
  );
}

export function ClientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      const path = query ? `/api/clients/export/excel?q=${encodeURIComponent(query)}` : "/api/clients/export/excel";
      await downloadFile(path, `거래처목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      logError("Clients", "목록 엑셀 다운로드 실패", err);
      setError("목록을 다운로드하지 못했습니다.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleOpenFile(clientId: number, kind: "biz-reg-image" | "bankbook-image") {
    logDebug("Clients", `첨부파일 열기: id=${clientId}, kind=${kind}`);
    try {
      await openFile(`/api/clients/${clientId}/${kind}`);
    } catch (err) {
      logError("Clients", "첨부파일 열기 실패", err);
      setError("파일을 열지 못했습니다.");
    }
  }

  async function handleDelete(e: MouseEvent, client: Client) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`"${client.name}" 거래처를 삭제하시겠습니까?`)) return;
    logDebug("Clients", `삭제 시도: id=${client.id}`);
    setDeletingId(client.id);
    try {
      await apiDelete(`/api/clients/${client.id}`);
      loadClients(query);
    } catch (err) {
      logError("Clients", "삭제 실패", err);
      setError("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <MainLayout
      title="거래처관리"
      description="거래처 정보를 등록하고 관리합니다."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface disabled:opacity-50"
          >
            <Download size={14} />
            {isExporting ? "다운로드 중..." : "목록 엑셀 다운로드"}
          </button>
          <NewClientButton />
        </div>
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
        <div className="border border-border rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left bg-primary/10 border-b-2 border-border">
                <th className="py-3 px-4 font-semibold text-text border border-border">업체명</th>
                <th className="py-3 px-4 font-semibold text-text border border-border">사업자번호</th>
                <th className="py-3 px-4 font-semibold text-text border border-border">담당자</th>
                <th className="py-3 px-4 font-semibold text-text border border-border">담당자 연락처</th>
                <th className="py-3 px-4 font-semibold text-text border border-border text-center">사업자등록증</th>
                <th className="py-3 px-4 font-semibold text-text border border-border text-center">통장사본</th>
                <th className="w-12 border border-border"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client, index) => {
                const contact = primaryContact(client);
                return (
                  <tr
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className={`cursor-pointer hover:bg-bg/60 ${index % 2 === 1 ? "bg-bg/40" : "bg-surface"}`}
                  >
                    <td className="py-3 px-4 font-medium text-text border border-border">{client.name}</td>
                    <td className="py-3 px-4 border border-border">{client.biz_reg_no || "-"}</td>
                    <td className="py-3 px-4 border border-border">
                      {contact ? (
                        <>
                          {contact.name}
                          {contact.title && ` (${contact.title})`}
                          {client.contacts.length > 1 && ` 외 ${client.contacts.length - 1}명`}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-4 border border-border">
                      {contact ? contact.mobile_phone || contact.landline_phone || "-" : "-"}
                    </td>
                    <td className="py-3 px-2 border border-border text-center" onClick={(e) => e.stopPropagation()}>
                      <FileButton
                        exists={client.has_biz_reg_image}
                        label="사업자등록증"
                        onClick={() => handleOpenFile(client.id, "biz-reg-image")}
                      />
                    </td>
                    <td className="py-3 px-2 border border-border text-center" onClick={(e) => e.stopPropagation()}>
                      <FileButton
                        exists={client.has_bankbook_image}
                        label="통장사본"
                        onClick={() => handleOpenFile(client.id, "bankbook-image")}
                      />
                    </td>
                    <td className="py-3 px-2 border border-border" onClick={(e) => e.stopPropagation()}>
                      {user?.role === "admin" && (
                        <button
                          onClick={(e) => handleDelete(e, client)}
                          disabled={deletingId === client.id}
                          title="거래처 삭제"
                          className="p-1.5 text-text-muted hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </MainLayout>
  );
}
