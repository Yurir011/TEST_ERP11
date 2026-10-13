import { FileSpreadsheet, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { ApiError, apiUpload } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { TX_TYPE_LABELS, TX_TYPE_STYLES, type TransactionType } from "./types";

interface SkippedRow {
  approval_no: string;
  transaction_date: string | null;
  type: TransactionType | null;
  counterparty_name: string;
  item_name: string;
  supply_amount: number;
  vat_amount: number;
  message: string;
}

interface ImportResult {
  duplicates: SkippedRow[];
  error_rows: SkippedRow[];
  imported: number;
  skipped_duplicates: number;
  errors: number;
  created_clients: number;
  created_documents: number;
}

function SkippedTable({ title, rows, tone }: { title: string; rows: SkippedRow[]; tone: "muted" | "danger" }) {
  return (
    <div className="mt-3">
      <p className={`text-sm font-semibold ${tone === "danger" ? "text-danger" : "text-text"}`}>
        {title} {rows.length}건
      </p>
      <div className="mt-1.5 border border-border rounded-xl overflow-x-auto max-h-[28vh] overflow-y-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="sticky top-0 bg-bg text-text-muted">
            <tr className="text-left">
              <th className="py-2 px-3 font-medium">구분</th>
              <th className="py-2 px-3 font-medium">작성일</th>
              <th className="py-2 px-3 font-medium">거래처</th>
              <th className="py-2 px-3 font-medium">품목</th>
              <th className="py-2 px-3 font-medium text-right">공급가액</th>
              <th className="py-2 px-3 font-medium">승인번호</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.approval_no} className="border-t border-border" title={r.message || undefined}>
                <td className="py-2 px-3">
                  {r.type ? (
                    <span className={`px-2 py-0.5 font-medium ${TX_TYPE_STYLES[r.type]}`}>{TX_TYPE_LABELS[r.type]}</span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="py-2 px-3 tabular-nums">{r.transaction_date ?? "-"}</td>
                <td className="py-2 px-3">{r.counterparty_name || "-"}</td>
                <td className="py-2 px-3 max-w-[180px] truncate">{r.item_name || r.message || "-"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.supply_amount)}</td>
                <td className="py-2 px-3 text-text-muted tabular-nums">{r.approval_no}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HometaxImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [createClients, setCreateClients] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 파일을 고르면 중복/오류를 뺀 나머지를 바로 입력하고, 건너뛴 항목은 결과 화면에서 알려준다.
  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setError(null);
    setResult(null);
    setFile(picked);
    setIsBusy(true);
    try {
      logDebug("HometaxImport", `자동 적용 요청: ${picked.name}, createClients=${createClients}`);
      const res = await apiUpload<ImportResult>(`/api/transactions/import-hometax?create_clients=${createClients}`, picked);
      logDebug("HometaxImport", `적용 결과: 입력 ${res.imported}건, 중복 ${res.duplicates.length}건, 오류 ${res.error_rows.length}건`);
      setResult(res);
      if (res.imported > 0) onImported();
    } catch (err) {
      logError("HometaxImport", "적용 실패", err);
      setError(err instanceof ApiError ? err.message : "적용 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-4xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">홈택스 세금계산서 엑셀 가져오기</h3>
          <button onClick={onClose} aria-label="닫기" className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">
          홈택스 &gt; 전자세금계산서 목록 조회에서 내려받은 엑셀(.xlsx / .xls)을 올리면, 우리 회사 사업자번호와 비교해 매출/매입을 자동으로 나누고{" "}
          <b>매입매출관리</b>와 <b>세금계산서(문서관리)</b> 양쪽에 바로 입력합니다. 이미 입력된 승인번호(중복)와 오류 항목은 제외하고 어떤 항목인지 알려드립니다.
        </p>

        <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={handleSelect} className="hidden" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
          className="flex items-center gap-1.5 text-sm border border-border rounded-lg px-4 py-2 hover:bg-bg disabled:opacity-50"
        >
          <FileSpreadsheet size={15} />
          {file ? "다른 파일 선택" : "엑셀 파일 선택"}
        </button>
        {file && <p className="text-xs text-text-muted mt-1.5">{file.name}</p>}

        <label className="flex items-start gap-2 mt-4 text-sm cursor-pointer">
          <input type="checkbox" checked={createClients} onChange={(e) => setCreateClients(e.target.checked)} className="accent-primary mt-0.5" />
          <span>
            사업자번호가 확인되는 새 거래처를 거래처관리에 자동 등록
            <span className="block text-xs text-text-muted">끄면 새 거래처는 등록하지 않고 상호만 기록합니다. (파일을 고르기 전에 설정하세요)</span>
          </span>
        </label>

        {isBusy && <p className="text-sm text-text-muted mt-4">가져오는 중...</p>}
        {error && <p className="text-sm text-danger mt-4">{error}</p>}

        {result && (
          <>
            <div className="mt-4 rounded-xl bg-tile-green text-tile-green-fg px-4 py-3 text-sm">
              <p className="font-semibold">{result.imported}건을 매입매출에 입력했습니다.</p>
              <p className="text-xs mt-1">
                세금계산서 {result.created_documents}건 등록 · 새 거래처 {result.created_clients}곳 등록
              </p>
            </div>
            {result.duplicates.length > 0 && (
              <div role="alert" className="mt-3 rounded-xl border border-border bg-bg px-4 py-3">
                <p className="text-sm">이미 입력된 승인번호라 아래 항목은 제외하고 나머지를 등록했습니다.</p>
                <SkippedTable title="중복 제외" rows={result.duplicates} tone="muted" />
              </div>
            )}
            {result.error_rows.length > 0 && (
              <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-danger">읽을 수 없어 제외한 항목입니다. (마우스를 올리면 사유가 보입니다)</p>
                <SkippedTable title="오류 제외" rows={result.error_rows} tone="danger" />
              </div>
            )}
          </>
        )}

        {result && (
          <div className="mt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-border text-sm px-5 py-2.5 hover:bg-bg">
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
