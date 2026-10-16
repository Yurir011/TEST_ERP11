import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";

export type BalanceKind = "receivable" | "payable";

interface BalanceHistoryEntry {
  created_at: string;
  user_name: string | null;
  before: number;
  after: number;
  delta: number;
  description: string;
  source_type: "payment" | "transaction" | null;
  source_id: number | null;
  source_deleted: boolean;
}

const KIND_LABELS: Record<BalanceKind, string> = { receivable: "미수금", payable: "미지급금" };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sourceLink(e: BalanceHistoryEntry): string | null {
  if (e.source_deleted || e.source_id === null) return null;
  if (e.source_type === "payment") return `/payments/${e.source_id}/edit`;
  if (e.source_type === "transaction") return `/transactions/${e.source_id}/edit`;
  return null;
}

interface BalanceHistoryModalProps {
  clientId: number;
  clientName: string;
  initialKind: BalanceKind;
  currentBalance: Record<BalanceKind, number>;
  onClose: () => void;
}

// 거래처 미수금/미지급금 변경 이력 (타임라인). 줄마다 원인이 된 입출금·매입매출로 이동할 수 있다.
export function BalanceHistoryModal({ clientId, clientName, initialKind, currentBalance, onClose }: BalanceHistoryModalProps) {
  const [kind, setKind] = useState<BalanceKind>(initialKind);
  const [entries, setEntries] = useState<BalanceHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    logDebug("Clients", `잔액 변경 이력 조회 시작: client_id=${clientId}, kind=${kind}`);
    apiGet<BalanceHistoryEntry[]>(`/api/clients/${clientId}/balance-history?kind=${kind}`)
      .then((rows) => {
        if (cancelled) return;
        logDebug("Clients", `잔액 변경 이력 조회 성공: ${rows.length}건`);
        setError(null);
        setEntries(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        logError("Clients", "잔액 변경 이력 조회 실패", err);
        setError("변경 이력을 불러오지 못했습니다.");
        setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, kind]);

  function changeKind(next: BalanceKind) {
    if (next === kind) return;
    setEntries(null); // 바꾸는 순간 이전 목록이 남아 보이지 않게 비운다
    setKind(next);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">
              {clientName} · {KIND_LABELS[kind]} 변경 이력
            </h3>
            <p className="text-xs text-text-muted mt-1">현재 잔액 {formatCurrency(currentBalance[kind])}</p>
          </div>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text" title="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 bg-bg rounded-lg p-1 w-fit mb-3">
          {(Object.keys(KIND_LABELS) as BalanceKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => changeKind(k)}
              className={`px-3 py-1 rounded-md text-xs transition-colors ${kind === k ? "bg-surface font-medium text-text shadow-sm" : "text-text-muted hover:text-text"}`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-danger mb-2">{error}</p>}
        {entries === null && <p className="text-xs text-text-muted">불러오는 중...</p>}
        {entries !== null && entries.length === 0 && !error && (
          <p className="text-sm text-text-muted py-6 text-center">
            기록된 변경이 없습니다.
            <span className="block text-xs mt-1">2026년 10월 16일 이후의 변경부터 기록됩니다.</span>
          </p>
        )}
        {entries !== null && entries.length > 0 && (
          <ul className="overflow-y-auto divide-y divide-border">
            {entries.map((e, i) => {
              const up = e.delta > 0;
              const link = sourceLink(e);
              const body = (
                <div className="grid grid-cols-[12px_1fr_auto] gap-3 py-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 ${up ? "bg-danger" : "bg-success"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{e.description}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {formatWhen(e.created_at)} · {e.user_name ?? "알 수 없음"}
                      {e.source_deleted && " · 원래 내역은 삭제됨"}
                    </p>
                  </div>
                  <div className="text-right whitespace-nowrap tabular-nums">
                    <p className={`text-sm font-semibold ${up ? "text-danger" : "text-success"}`}>
                      {up ? "+" : "−"}
                      {formatCurrency(Math.abs(e.delta))}
                    </p>
                    <p className="text-[11px] text-text-muted">잔액 {formatCurrency(e.after)}</p>
                  </div>
                </div>
              );
              return (
                <li key={`${e.created_at}-${i}`}>
                  {link ? (
                    <Link to={link} onClick={onClose} className="block hover:bg-bg rounded-lg -mx-2 px-2" title="원래 내역 보기">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-text-muted mt-3">빨강 = 잔액 증가(외상 발생), 초록 = 잔액 감소(수금·지급). 줄을 누르면 원래 내역으로 이동합니다.</p>
      </div>
    </div>
  );
}
