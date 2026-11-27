import { Check, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { DateField } from "../../components/ui/DateField";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { NumberInput } from "../../components/ui/NumberInput";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import type { Delivery, DeliveryList, ProgressStage } from "./types";

const fmt = (n: number) => n.toLocaleString("en-US");

/** "납품" 진행 단계의 표시 상태: 미완료 / 납품 중(기록은 있으나 완료 전, 분할 납품 중) / 완료 */
export type DeliveryState = "none" | "partial" | "done";

export function deliveryState(stage: Pick<ProgressStage, "progress_percent">, list: DeliveryList | null): DeliveryState {
  if (stage.progress_percent === 100) return "done";
  return list && list.total_count > 0 ? "partial" : "none";
}

/** 이름이 정확히 "납품"인 진행 단계가 납품 항목이다 */
export function isDeliveryStage(stage: Pick<ProgressStage, "name">): boolean {
  return stage.name.trim() === "납품";
}

/** 바 옆에 적는 글: 완료는 "11/30 · 250개"(분할이면 "11/30 · 3회 250개"), 납품 중은 "누적 1회 · 100개" */
export function deliveryLabel(state: DeliveryState, list: DeliveryList | null): string | null {
  if (!list || list.total_count === 0 || state === "none") return null;
  const last = list.items.reduce((m, d) => (d.delivered_on > m ? d.delivered_on : m), "").slice(5, 10).replace("-", "/");
  if (state === "partial") return `누적 ${list.total_count}회 · ${fmt(list.total_quantity)}개`;
  return list.total_count === 1 ? `${last} · ${fmt(list.total_quantity)}개` : `${last} · ${list.total_count}회 ${fmt(list.total_quantity)}개`;
}

/**
 * 납품 팝업: 납품일·개수를 기록하고 [납품완료]로 마감한다. 나눠서 납품하면 [기록 추가]로 여러 번 쌓은 뒤 마지막에 완료한다.
 * 기록은 언제든 고치거나 지울 수 있고, 완료도 [완료 취소]로 되돌릴 수 있다. 기록은 연간 납품 통계의 원본이다.
 */
export function DeliveryDialog({
  projectId,
  stage,
  onClose,
  onChanged,
}: {
  projectId: number;
  stage: ProgressStage;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { confirm } = useDialog();
  const [data, setData] = useState<DeliveryList | null>(null);
  const [done, setDone] = useState(stage.progress_percent === 100);
  const [date, setDate] = useState(todayISO());
  const [quantity, setQuantity] = useState("");
  const [memo, setMemo] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDone(stage.progress_percent === 100), [stage.progress_percent]);

  function load() {
    logDebug("DeliveryDialog", `납품 내역 조회: project_id=${projectId}`);
    return apiGet<DeliveryList>(`/api/projects/${projectId}/deliveries`)
      .then(setData)
      .catch((err) => {
        logError("DeliveryDialog", "납품 내역 조회 실패", err);
        setError("납품 내역을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function resetForm() {
    setEditId(null);
    setDate(todayISO());
    setQuantity("");
    setMemo("");
  }

  const qty = Number(quantity.replace(/,/g, ""));
  const filled = qty > 0;

  /** 입력한 납품 한 건을 저장한다 (수정 중이면 수정). 저장했으면 true */
  async function saveRecord(): Promise<boolean> {
    const body = { delivered_on: date, quantity: qty, memo: memo.trim() || null };
    logDebug("DeliveryDialog", `납품 ${editId ? "수정" : "등록"}: project_id=${projectId}, ${date}, ${qty}개`);
    if (editId) await apiPut(`/api/projects/${projectId}/deliveries/${editId}`, body);
    else await apiPost(`/api/projects/${projectId}/deliveries`, body);
    resetForm();
    return true;
  }

  async function setCompleted(completed: boolean, record?: { delivered_on: string; quantity: number; memo: string | null }) {
    logDebug("DeliveryDialog", `납품 항목 ${completed ? "완료" : "완료 취소"}: stage_id=${stage.id}`);
    await apiPut(`/api/projects/${projectId}/progress-stages/${stage.id}/delivery-status`, { completed, record: record ?? null });
    setDone(completed);
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await load();
      onChanged();
    } catch (err) {
      logError("DeliveryDialog", "납품 처리 실패", err);
      setError(err instanceof ApiError ? err.message : "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 기록 추가·수정 저장 (분할 납품: 완료는 따로)
  function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!filled) {
      setError("납품 개수를 입력해 주세요.");
      return;
    }
    void run(async () => {
      await saveRecord();
    });
  }

  // 납품완료: 입력한 내용이 있으면 먼저 기록하고, 완료로 표시한다
  function handleComplete() {
    if (!filled && !(data && data.total_count > 0)) {
      setError("납품일과 개수를 입력해 주세요.");
      return;
    }
    void run(async () => {
      if (filled && editId) {
        await saveRecord(); // 고치던 기록은 저장만 하고
        await setCompleted(true);
      } else if (filled) {
        // 입력한 기록은 완료와 함께 적는다: 완료를 취소하면 이 기록도 함께 사라진다
        const record = { delivered_on: date, quantity: qty, memo: memo.trim() || null };
        resetForm();
        await setCompleted(true, record);
      } else {
        await setCompleted(true);
      }
    });
  }

  async function handleCancelComplete() {
    if (!(await confirm("납품완료를 취소할까요? 완료하면서 적은 납품 기록은 지워지고 완료 전 상태로 돌아갑니다. (그 전에 따로 적은 분할 납품 기록은 남습니다)", { okLabel: "완료 취소" }))) return;
    void run(() => setCompleted(false));
  }

  async function handleDelete(d: Delivery) {
    if (!(await confirm(`${d.delivered_on.slice(0, 10)} 납품 ${fmt(d.quantity)}개 기록을 삭제할까요? 연간 통계에서도 빠지고, 기록이 모두 없어지면 납품 항목은 미완료로 돌아갑니다.`, { okLabel: "삭제", danger: true }))) return;
    void run(async () => {
      await apiDelete(`/api/projects/${projectId}/deliveries/${d.id}`);
      if (editId === d.id) resetForm();
      const left = (data?.total_count ?? 1) - 1;
      if (left <= 0) setDone(false);
    });
  }

  function startEdit(d: Delivery) {
    setError(null);
    setEditId(d.id);
    setDate(d.delivered_on.slice(0, 10));
    setQuantity(String(d.quantity));
    setMemo(d.memo ?? "");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="납품"
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-2xl bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="닫기" title="닫기" className="absolute right-4 top-4 text-text-muted hover:text-text">
          <X size={18} />
        </button>
        <div className="flex items-center gap-2 pr-8">
          <h3 className="text-base font-semibold">납품</h3>
          {done ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-tile-green px-2.5 py-0.5 text-xs font-semibold text-tile-green-fg">
              <Check size={12} aria-hidden />
              납품완료
            </span>
          ) : data && data.total_count > 0 ? (
            <span className="rounded-full bg-tile-orange px-2.5 py-0.5 text-xs font-semibold text-tile-orange-fg">납품 중</span>
          ) : (
            <span className="rounded-full bg-bg px-2.5 py-0.5 text-xs font-semibold text-text-muted">미완료</span>
          )}
        </div>
        <p className="text-xs text-text-muted">납품일과 개수를 적고 [납품완료]를 누르세요. 나눠서 납품하면 [기록 추가]로 여러 번 기록한 뒤 마지막에 완료합니다.</p>

        <form onSubmit={handleSave} className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-bg p-3 sm:grid-cols-[9.5rem_8rem_1fr]">
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
            개수 (개)
            <NumberInput
              aria-label="납품 개수"
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
          <div className="col-span-2 flex flex-wrap justify-end gap-2 sm:col-span-3">
            {editId ? (
              <>
                <button type="button" onClick={resetForm} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-surface">
                  수정 취소
                </button>
                <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
                  수정 저장
                </button>
              </>
            ) : (
              <>
                <button type="submit" disabled={busy} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-bg disabled:opacity-60">
                  기록 추가 (분할 납품)
                </button>
                {done ? (
                  <button type="button" onClick={() => void handleCancelComplete()} disabled={busy} className="rounded-lg border border-danger px-4 py-1.5 text-xs font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-60">
                    완료 취소
                  </button>
                ) : (
                  <button type="button" onClick={handleComplete} disabled={busy} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
                    납품완료
                  </button>
                )}
              </>
            )}
          </div>
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
            누적 개수 <b className="text-sm text-text tabular-nums">{data ? fmt(data.total_quantity) : "-"}개</b>
          </span>
        </div>

        {data && data.items.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="pb-1.5 font-medium">납품일</th>
                <th className="pb-1.5 text-right font-medium">개수</th>
                <th className="pb-1.5 pl-3 font-medium">메모</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className={`border-t border-border ${editId === d.id ? "bg-tile-blue/40" : ""}`}>
                  <td className="py-1.5 tabular-nums">{d.delivered_on.slice(0, 10)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(d.quantity)}</td>
                  <td className="py-1.5 pl-3 text-text-muted">{d.memo ?? ""}</td>
                  <td className="whitespace-nowrap py-1.5 text-right">
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
        ) : (
          data && <p className="text-xs text-text-muted">아직 납품 기록이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
