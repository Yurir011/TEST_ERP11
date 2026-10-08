import { FileSpreadsheet, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { ApiError, apiUpload } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { TX_TYPE_LABELS, TX_TYPE_STYLES, type TransactionType } from "./types";

interface PreviewRow {
  approval_no: string;
  transaction_date: string | null;
  type: TransactionType | null;
  counterparty_name: string;
  counterparty_reg_no: string;
  item_name: string;
  supply_amount: number;
  vat_amount: number;
  status: "new" | "duplicate" | "error";
  message: string;
  client_action: "existing" | "create" | "create_same" | "none";
}

interface Preview {
  company_reg_no: string;
  total: number;
  new_count: number;
  duplicate_count: number;
  error_count: number;
  new_client_count: number;
  rows: PreviewRow[];
}

interface ImportResult {
  imported: number;
  skipped_duplicates: number;
  errors: number;
  created_clients: number;
  created_documents: number;
}

const STATUS_LABELS: Record<PreviewRow["status"], string> = { new: "신규", duplicate: "중복", error: "오류" };
const STATUS_STYLES: Record<PreviewRow["status"], string> = {
  new: "bg-tile-green text-tile-green-fg",
  duplicate: "bg-bg text-text-muted border border-border",
  error: "bg-red-50 text-danger",
};

function clientLabel(row: PreviewRow): string {
  if (row.client_action === "existing") return "기존 거래처 연결";
  if (row.client_action === "create") return "새 거래처 등록";
  if (row.client_action === "create_same") return "새 거래처 등록(위와 동일)";
  return "상호만 기록";
}

export function HometaxImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [createClients, setCreateClients] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setError(null);
    setPreview(null);
    setResult(null);
    setFile(picked);
    setIsBusy(true);
    try {
      logDebug("HometaxImport", `미리보기 요청: ${picked.name}`);
      setPreview(await apiUpload<Preview>("/api/transactions/import-hometax/preview", picked));
    } catch (err) {
      logError("HometaxImport", "미리보기 실패", err);
      setError(err instanceof ApiError ? err.message : "파일을 읽지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApply() {
    if (!file || !preview) return;
    setIsBusy(true);
    setError(null);
    try {
      logDebug("HometaxImport", `적용 요청: ${file.name}, createClients=${createClients}`);
      const res = await apiUpload<ImportResult>(`/api/transactions/import-hometax?create_clients=${createClients}`, file);
      setResult(res);
      setPreview(null);
      onImported();
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
          홈택스 &gt; 전자세금계산서 목록 조회에서 내려받은 엑셀(.xlsx / .xls)을 올리면, 내용을 먼저 보여드린 뒤 확인하고 적용합니다. 우리 회사 사업자번호와
          비교해 매출/매입을 자동으로 나누고, <b>매입매출관리</b>와 <b>세금계산서(문서관리)</b> 양쪽에 함께 입력합니다.
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

        {isBusy && !preview && <p className="text-sm text-text-muted mt-4">처리 중...</p>}
        {error && <p className="text-sm text-danger mt-4">{error}</p>}

        {result && (
          <div className="mt-4 rounded-xl bg-tile-green text-tile-green-fg px-4 py-3 text-sm">
            <p className="font-semibold">{result.imported}건을 매입매출에 입력했습니다.</p>
            <p className="text-xs mt-1">
              세금계산서 {result.created_documents}건 등록 · 새 거래처 {result.created_clients}곳 등록 · 중복 {result.skipped_duplicates}건 건너뜀 · 오류 {result.errors}건 제외
            </p>
          </div>
        )}

        {preview && (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-5 text-sm">
              <span>
                전체 <b>{preview.total}</b>건
              </span>
              <span className="text-tile-green-fg">
                입력 예정 <b>{preview.new_count}</b>건
              </span>
              <span className="text-text-muted">
                중복 <b>{preview.duplicate_count}</b>건
              </span>
              <span className={preview.error_count ? "text-danger" : "text-text-muted"}>
                오류 <b>{preview.error_count}</b>건
              </span>
              <span className="text-text-muted">
                새로 등록될 거래처 <b>{preview.new_client_count}</b>곳
              </span>
            </div>

            <div className="mt-3 border border-border rounded-xl overflow-x-auto max-h-[44vh] overflow-y-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead className="sticky top-0 bg-bg text-text-muted">
                  <tr className="text-left">
                    <th className="py-2 px-3 font-medium">상태</th>
                    <th className="py-2 px-3 font-medium">구분</th>
                    <th className="py-2 px-3 font-medium">작성일</th>
                    <th className="py-2 px-3 font-medium">거래처</th>
                    <th className="py-2 px-3 font-medium">품목</th>
                    <th className="py-2 px-3 font-medium text-right">공급가액</th>
                    <th className="py-2 px-3 font-medium text-right">세액</th>
                    <th className="py-2 px-3 font-medium">거래처 처리</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.approval_no} className="border-t border-border" title={r.message || undefined}>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                      </td>
                      <td className="py-2 px-3">
                        {r.type ? (
                          <span className={`px-2 py-0.5 rounded-full font-medium ${TX_TYPE_STYLES[r.type]}`}>{TX_TYPE_LABELS[r.type]}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2 px-3 tabular-nums">{r.transaction_date ?? "-"}</td>
                      <td className="py-2 px-3">
                        {r.counterparty_name || "-"}
                        {r.counterparty_reg_no && <span className="block text-text-muted tabular-nums">{r.counterparty_reg_no}</span>}
                      </td>
                      <td className="py-2 px-3 max-w-[160px] truncate">{r.item_name || "-"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.supply_amount)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.vat_amount)}</td>
                      <td className="py-2 px-3 text-text-muted">{r.status === "error" ? r.message : clientLabel(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="flex items-start gap-2 mt-4 text-sm cursor-pointer">
              <input type="checkbox" checked={createClients} onChange={(e) => setCreateClients(e.target.checked)} className="accent-primary mt-0.5" />
              <span>
                사업자번호가 확인되는 새 거래처를 거래처관리에 자동 등록
                <span className="block text-xs text-text-muted">끄면 새 거래처는 등록하지 않고 상호만 기록합니다.</span>
              </span>
            </label>

            <div className="flex items-center gap-2 mt-4">
              <button
                type="button"
                onClick={handleApply}
                disabled={isBusy || preview.new_count === 0}
                className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50"
              >
                {isBusy ? "적용 중..." : `${preview.new_count}건 적용`}
              </button>
              <button type="button" onClick={onClose} className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg">
                취소
              </button>
            </div>
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
