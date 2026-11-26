import { Check, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { DateField } from "../../components/ui/DateField";
import { NumberInput } from "../../components/ui/NumberInput";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import type { Delivery, DeliveryList } from "./types";

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * 납품 입력: 납품일·수량·메모를 한 줄로 적고 [납품완료 저장]을 누르면 곧바로 납품완료로 기록된다.
 * 아래에 누적 횟수·개수와 납품 내역이 보이고, 이 기록이 연간 납품 통계의 원본이다.
 */
export function ProjectDeliveryPanel({ projectId }: { projectId: number }) {
  const { confirm } = useDialog();
  const [data, setData] = useState<DeliveryList | null>(null);
  const [date, setDate] = useState(todayISO());
  const [quantity, setQuantity] = useState("");
  const [memo, setMemo] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    logDebug("ProjectDelivery", `납품 내역 조회: project_id=${projectId}`);
    apiGet<DeliveryList>(`/api/projects/${projectId}/deliveries`)
      .then(setData)
      .catch((err) => {
        logError("ProjectDelivery", "납품 내역 조회 실패", err);
        setError("납품 내역을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function resetForm() {
    setEditId(null);
    setDate(todayISO());
    setQuantity("");
    setMemo("");
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const qty = Number(quantity.replace(/,/g, ""));
    if (!qty || qty <= 0) {
      setError("납품 수량을 입력해 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    const body = { delivered_on: date, quantity: qty, memo: memo.trim() || null };
    logDebug("ProjectDelivery", `납품 ${editId ? "수정" : "등록"} 시도: project_id=${projectId}, ${date}, ${qty}개`);
    try {
      if (editId) await apiPut(`/api/projects/${projectId}/deliveries/${editId}`, body);
      else await apiPost(`/api/projects/${projectId}/deliveries`, body);
      resetForm();
      load();
    } catch (err) {
      logError("ProjectDelivery", "납품 저장 실패", err);
      setError(err instanceof ApiError ? err.message : "납품을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(d: Delivery) {
    setError(null);
    setEditId(d.id);
    setDate(d.delivered_on.slice(0, 10));
    setQuantity(String(d.quantity));
    setMemo(d.memo ?? "");
  }

  async function handleDelete(d: Delivery) {
    if (!(await confirm(`${d.delivered_on.slice(0, 10)} 납품 ${fmt(d.quantity)}개 기록을 삭제할까요? 연간 통계에서도 빠집니다.`, { okLabel: "삭제", danger: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/projects/${projectId}/deliveries/${d.id}`);
      logDebug("ProjectDelivery", `납품 삭제: id=${d.id}`);
      if (editId === d.id) resetForm();
      load();
    } catch (err) {
      logError("ProjectDelivery", "납품 삭제 실패", err);
      setError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  return (
    <section aria-label="납품" className="mt-3 rounded-xl border border-border bg-bg p-4 flex flex-col gap-3">
      <form onSubmit={handleSave} className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_8rem_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          납품일
          <DateField
            block
            aria-label="납품일"
            value={date}
            max={todayISO()}
            onChange={(v) => v && setDate(v)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          수량 (개)
          <NumberInput
            aria-label="납품 수량"
            value={quantity}
            onChange={setQuantity}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-right text-sm font-semibold tabular-nums text-text outline-none focus:border-primary"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-text-muted sm:col-span-1">
          메모
          <input
            aria-label="납품 메모"
            value={memo}
            maxLength={300}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 1차 납품 · 한솔전자 입고"
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
        <span className="col-span-2 flex justify-end gap-2 sm:col-span-1">
          {editId && (
            <button type="button" onClick={resetForm} className="rounded-lg border border-border px-3 py-2 text-xs text-text-muted hover:bg-surface">
              취소
            </button>
          )}
          <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
            {editId ? "수정 저장" : "납품완료 저장"}
          </button>
        </span>
      </form>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-muted">
        <span>
          누적 납품 <b className="text-sm text-text tabular-nums">{data ? data.total_count : "-"}회</b>
        </span>
        <span>
          누적 수량 <b className="text-sm text-text tabular-nums">{data ? fmt(data.total_quantity) : "-"}개</b>
        </span>
      </div>

      {data && data.items.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="pb-1.5 font-medium">납품일</th>
              <th className="pb-1.5 text-right font-medium">수량</th>
              <th className="pb-1.5 pl-3 font-medium">메모</th>
              <th className="pb-1.5 font-medium">상태</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="py-1.5 tabular-nums">{d.delivered_on.slice(0, 10)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(d.quantity)}</td>
                <td className="py-1.5 pl-3 text-text-muted">{d.memo ?? ""}</td>
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-tile-green px-2 py-0.5 text-[11px] font-semibold text-tile-green-fg">
                    <Check size={11} aria-hidden />
                    납품완료
                  </span>
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  <button type="button" onClick={() => startEdit(d)} aria-label={`${d.delivered_on.slice(0, 10)} 납품 수정`} title="수정" className="p-1 text-text-muted hover:text-primary">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => void handleDelete(d)} aria-label={`${d.delivered_on.slice(0, 10)} 납품 삭제`} title="삭제" className="p-1 text-text-muted hover:text-danger">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.items.length === 0 && <p className="text-xs text-text-muted">아직 납품 기록이 없습니다. 위에 납품일과 수량을 적고 저장하세요.</p>}
    </section>
  );
}
