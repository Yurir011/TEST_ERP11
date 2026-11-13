import { Download, Paperclip, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiGet, apiUploadForm, downloadFile } from "../../lib/api";
import { offerInvoiceRegistration } from "../../lib/invoiceOffer";
import { logDebug, logError } from "../../lib/logger";
import { useFileDropZone } from "../../lib/useFileDropZone";
import { openAttachment } from "../../lib/openAttachment";
import { formatBytes } from "../gerber/types";

export interface TransactionFileRow {
  id: number;
  transaction_id: number;
  filename: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
}

/** 서버가 받는 형식과 같다 (PDF·이미지·XML·엑셀 등) */
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.xml,.xls,.xlsx,.csv,.hwp,.hwpx,.doc,.docx,.txt,.zip,image/*";

/** 거래에 붙인 파일을 서버에 올린다 (새 거래를 저장한 직후에도 쓴다) */
export function uploadTransactionFiles(txId: number, files: File[]): Promise<TransactionFileRow[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return apiUploadForm<TransactionFileRow[]>(`/api/transactions/${txId}/files`, form);
}

/**
 * 매입매출 거래의 세금계산서 파일 칸. 파일 선택, 끌어다 놓기, 복사한 이미지 붙여넣기(Ctrl+V)로 여러 개를 붙일 수 있다.
 * 수정할 때(txId 있음)는 고르는 즉시 올라가고, 새 거래(txId 없음)는 저장할 때 함께 올라가도록 pending 에 모아 둔다.
 */
export function TransactionFilesSection({ txId, pending, onPendingChange }: { txId: number | null; pending: File[]; onPendingChange: (files: File[]) => void }) {
  const { confirm, notifyError } = useDialog();
  const zone = useFileDropZone("TransactionFile");
  const [rows, setRows] = useState<TransactionFileRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (txId === null) return;
    logDebug("TransactionFile", `파일 목록 조회 시작: tx_id=${txId}`);
    apiGet<TransactionFileRow[]>(`/api/transactions/${txId}/files`)
      .then((r) => {
        logDebug("TransactionFile", `파일 목록 조회 성공: ${r.length}건`);
        setRows(r);
      })
      .catch((err) => {
        logError("TransactionFile", "파일 목록 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "파일 목록을 불러오지 못했습니다.");
      });
  }, [txId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (txId === null) {
      logDebug("TransactionFile", `새 거래에 붙일 파일 ${files.length}개 대기`);
      onPendingChange([...pending, ...files]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      logDebug("TransactionFile", `파일 올리기 시도: tx_id=${txId}, files=${files.length}`);
      setRows(await uploadTransactionFiles(txId, files));
      offerInvoiceRegistration({ files, transactionId: txId }); // 세금계산서 목록에도 등록할지 묻는다
    } catch (err) {
      logError("TransactionFile", "파일 올리기 실패", err);
      const message = err instanceof ApiError ? err.message : "파일을 올리지 못했습니다.";
      setError(message);
      notifyError(message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: TransactionFileRow) {
    if (!(await confirm(`"${row.filename}" 파일을 삭제할까요? 되돌릴 수 없습니다.`, { okLabel: "삭제", danger: true }))) return;
    try {
      logDebug("TransactionFile", `파일 삭제 시도: id=${row.id}`);
      setRows(await apiDelete<TransactionFileRow[]>(`/api/transactions/${row.transaction_id}/files/${row.id}`));
    } catch (err) {
      logError("TransactionFile", "파일 삭제 실패", err);
      notifyError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  /** 이름을 누르면 팝업으로 바로 본다 (사진·PDF·글자 파일. 그 밖의 문서는 받기/기본 프로그램) */
  async function open(row: TransactionFileRow) {
    try {
      await openAttachment(`/api/transactions/${row.transaction_id}/files/${row.id}/file`, row.filename);
    } catch (err) {
      logError("TransactionFile", "파일 열기 실패", err);
      notifyError(err instanceof ApiError ? err.message : "파일을 열지 못했습니다.");
    }
  }

  async function download(row: TransactionFileRow) {
    try {
      await downloadFile(`/api/transactions/${row.transaction_id}/files/${row.id}/file`, row.filename);
    } catch (err) {
      logError("TransactionFile", "파일 받기 실패", err);
      notifyError(err instanceof ApiError ? err.message : "파일을 받지 못했습니다.");
    }
  }

  return (
    <div
      ref={zone.box}
      {...zone.handlers}
      className={`rounded-xl border border-dashed px-4 py-3 ${zone.dragOver ? "border-primary bg-tile-blue" : "border-border"}`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Paperclip size={14} />
          세금계산서 파일 (선택)
        </span>
        <label className="flex cursor-pointer items-center gap-1 text-xs text-primary hover:opacity-80">
          {busy ? "올리는 중..." : "파일 선택"}
          <input ref={zone.input} type="file" multiple accept={ACCEPT} disabled={busy} onChange={(e) => void onSelect(e)} className="hidden" />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-primary">파일을 이 칸으로 끌어다 놓거나, 캡처·복사한 이미지를 Ctrl+V 로 붙여 넣을 수도 있습니다. (PDF·이미지·XML·엑셀 등, 파일당 20MB 이하)</p>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}

      {(rows ?? []).length > 0 && (
        <ul className="mt-2 space-y-1">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg px-2.5 py-1.5 text-xs">
              <button type="button" onClick={() => void open(r)} title="눌러서 내용 보기" aria-label={`${r.filename} 열기`} className="min-w-0 flex-1 truncate text-left hover:text-primary hover:underline underline-offset-2">
                {r.filename} <span className="text-text-muted">· {formatBytes(r.file_size)}</span>
              </button>
              <span className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => void download(r)} aria-label={`${r.filename} 받기`} title="받기" className="text-text-muted hover:text-primary">
                  <Download size={14} />
                </button>
                <button type="button" onClick={() => void remove(r)} aria-label={`${r.filename} 삭제`} title="삭제" className="text-text-muted hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {txId === null && pending.length > 0 && (
        <ul className="mt-2 space-y-1">
          {pending.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-bg px-2.5 py-1.5 text-xs">
              <span className="min-w-0 truncate">
                {f.name} <span className="text-text-muted">· {formatBytes(f.size)} · 저장할 때 올라갑니다</span>
              </span>
              <button type="button" onClick={() => onPendingChange(pending.filter((_, idx) => idx !== i))} aria-label={`${f.name} 빼기`} title="빼기" className="shrink-0 text-text-muted hover:text-danger">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
