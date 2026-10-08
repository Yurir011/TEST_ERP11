import { Building2, Download, FileText, Search, Trash2 } from "lucide-react";
import { Fragment, useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { canDeleteClient } from "../../lib/auth";
import { useAuth } from "../../context/AuthContext";
import { apiDelete, apiGet, downloadFile, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { NewClientButton } from "./NewClientButton";
import type { Client } from "./types";

// 거래처 수가 많아졌을 때 찾기 쉽도록 초성 구간별로 묶어서 보여준다 (모든 자음으로 나누지 않고 비슷한 자음끼리 묶음).
const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const GROUP_ORDER = ["ㄱ", "ㄴ~ㄷ", "ㄹ~ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ~ㅎ", "A-Z", "기타"];
const CHOSEONG_GROUP: Record<string, string> = {
  ㄱ: "ㄱ", ㄲ: "ㄱ",
  ㄴ: "ㄴ~ㄷ", ㄷ: "ㄴ~ㄷ", ㄸ: "ㄴ~ㄷ",
  ㄹ: "ㄹ~ㅁ", ㅁ: "ㄹ~ㅁ",
  ㅂ: "ㅂ", ㅃ: "ㅂ",
  ㅅ: "ㅅ", ㅆ: "ㅅ",
  ㅇ: "ㅇ",
  ㅈ: "ㅈ", ㅉ: "ㅈ",
  ㅊ: "ㅊ~ㅎ", ㅋ: "ㅊ~ㅎ", ㅌ: "ㅊ~ㅎ", ㅍ: "ㅊ~ㅎ", ㅎ: "ㅊ~ㅎ",
};

// "(주)", "주식회사" 같은 법인 표기는 빼고 실제 상호의 첫 글자로 구간을 정한다.
function nameGroup(name: string): string {
  const core = name.replace(/^\s*(\(주\)|㈜|주식회사|\(유\)|유한회사)\s*/, "").trim();
  const ch = core.charAt(0);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code <= 11171) return CHOSEONG_GROUP[CHOSEONG[Math.floor(code / 588)]] ?? "기타";
  if (/[A-Za-z]/.test(ch)) return "A-Z";
  return "기타";
}

function groupClients(clients: Client[]): { label: string; items: Client[] }[] {
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const map = new Map<string, Client[]>();
  for (const c of sorted) {
    const g = nameGroup(c.name);
    map.set(g, [...(map.get(g) ?? []), c]);
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
}

const ALL_TAB = "전체";
const TAB_STORAGE_KEY = "clients-list-tab";

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
      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover rounded-full px-2.5 py-1 hover:bg-primary/10"
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
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      return sessionStorage.getItem(TAB_STORAGE_KEY) || ALL_TAB;
    } catch {
      return ALL_TAB;
    }
  });

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

  const groups = clients ? groupClients(clients) : [];
  const tabs = [ALL_TAB, ...groups.map((g) => g.label)];
  // 검색 등으로 선택한 구간에 거래처가 없어지면 전체로 되돌려 보여준다.
  const currentTab = tabs.includes(activeTab) ? activeTab : ALL_TAB;
  const visibleGroups = currentTab === ALL_TAB ? groups : groups.filter((g) => g.label === currentTab);
  const visibleCount = visibleGroups.reduce((sum, g) => sum + g.items.length, 0);
  const tabIndex = tabs.indexOf(currentTab);

  function selectTab(tab: string) {
    logDebug("Clients", `구간 탭 선택: tab=${tab}`);
    setActiveTab(tab);
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // 저장 실패는 무시한다 (선택 기억만 안 될 뿐 동작에는 영향 없음)
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
      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상호, 담당자, 사업자번호로 검색"
          className="w-full rounded-xl border-0 bg-text/[0.06] pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary placeholder:text-text-muted"
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
        <>
        <div className="sticky top-0 z-10 -mx-2 px-2 py-2.5 bg-bg/80 backdrop-blur-xl">
          <div role="tablist" aria-label="초성 구간" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-text/[0.06] p-[3px]">
            {tabs.map((tab) => {
              const count = tab === ALL_TAB ? clients.length : groups.find((g) => g.label === tab)?.items.length ?? 0;
              const selected = tab === currentTab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectTab(tab)}
                  className={`flex items-baseline gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] transition-colors ${
                    selected ? "bg-surface font-semibold text-text shadow-sm" : "text-text hover:bg-text/[0.06]"
                  }`}
                >
                  {tab}
                  <span className="text-[11px] font-normal tabular-nums text-text-muted">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="flex items-baseline justify-between mt-5 mb-2.5 px-1">
          <b className="text-xl font-bold tracking-tight">{currentTab === ALL_TAB ? "전체" : `${currentTab} 구간`} {visibleCount}곳</b>
          <span className="text-xs text-text-muted">{query ? `검색어 '${query}' 적용 중` : "가나다순"}</span>
        </p>
        <div className="bg-surface rounded-[20px] shadow-sm overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs bg-primary/[0.12]">
                <th className="py-3.5 pl-7 pr-4 font-semibold text-primary w-[22%]">업체명</th>
                <th className="py-3.5 px-4 font-semibold text-primary whitespace-nowrap w-[13%]">사업자번호</th>
                <th className="py-3.5 px-4 font-semibold text-primary whitespace-nowrap w-[13%]">유선번호</th>
                <th className="py-3.5 px-4 font-semibold text-primary whitespace-nowrap w-[15%]">담당자</th>
                <th className="py-3.5 px-4 font-semibold text-primary whitespace-nowrap w-[14%]">담당자 연락처</th>
                <th className="py-3.5 px-3 font-semibold text-primary text-center whitespace-nowrap w-[8%]">사업자등록증</th>
                <th className="py-3.5 px-3 font-semibold text-primary text-center whitespace-nowrap w-[8%]">통장사본</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((group, groupIndex) => (
                <Fragment key={group.label}>
                  {/* 전체 보기에서는 구간 사이를 글자 없이 얇은 띠로만 구분한다. */}
                  {currentTab === ALL_TAB && groupIndex > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={8} className="h-2.5 p-0 bg-text/[0.06]" />
                    </tr>
                  )}
                  {group.items.map((client, index) => {
                const contact = primaryContact(client);
                return (
                  <tr
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className={`cursor-pointer hover:bg-primary/10 ${index % 2 === 1 ? "bg-text/[0.025]" : ""}`}
                  >
                    <td className="py-3.5 pl-7 pr-4 font-semibold text-text max-w-0 truncate" title={client.name}>{client.name}</td>
                    <td className="py-3.5 px-4 tabular-nums text-text-muted whitespace-nowrap">{client.biz_reg_no || "-"}</td>
                    <td className="py-3.5 px-4 tabular-nums text-text-muted whitespace-nowrap">{client.phone || "-"}</td>
                    <td className="py-3.5 px-4 truncate">
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
                    <td className="py-3.5 px-4 tabular-nums text-text-muted whitespace-nowrap">
                      {contact ? contact.mobile_phone || contact.landline_phone || "-" : "-"}
                    </td>
                    <td className="py-3.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <FileButton
                        exists={client.has_biz_reg_image}
                        label="사업자등록증"
                        onClick={() => handleOpenFile(client.id, "biz-reg-image")}
                      />
                    </td>
                    <td className="py-3.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <FileButton
                        exists={client.has_bankbook_image}
                        label="통장사본"
                        onClick={() => handleOpenFile(client.id, "bankbook-image")}
                      />
                    </td>
                    <td className="py-3.5 px-2" onClick={(e) => e.stopPropagation()}>
                      {canDeleteClient(user) && (
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
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between gap-2 mt-3">
          <button
            type="button"
            disabled={tabIndex <= 0}
            onClick={() => selectTab(tabs[tabIndex - 1])}
            className="text-sm text-primary rounded-md px-1 py-1.5 hover:underline disabled:opacity-30 disabled:no-underline"
          >
            {tabIndex > 0 ? `← ${tabs[tabIndex - 1]}` : "← 이전"}
          </button>
          <button
            type="button"
            disabled={tabIndex >= tabs.length - 1}
            onClick={() => selectTab(tabs[tabIndex + 1])}
            className="text-sm text-primary rounded-md px-1 py-1.5 hover:underline disabled:opacity-30 disabled:no-underline"
          >
            {tabIndex < tabs.length - 1 ? `${tabs[tabIndex + 1]} →` : "다음 →"}
          </button>
        </div>
        </>
      )}
    </MainLayout>
  );
}
