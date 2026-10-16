import { useState } from "react";
import { ApiError, apiPost } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import { CARD_TYPE_LABELS, type CardPendingSummary, type CardType } from "./types";
import { useDialog } from "../../components/ui/dialog/useDialog";

/** 카드 결제일에 해당 카드의 결제예정 사용내역을 한 번에 출금 확정하는 팝업. */
export function CardSettleModal({
  summaries,
  onClose,
  onSuccess,
}: {
  summaries: CardPendingSummary[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { confirm, notify } = useDialog();
  const [dates, setDates] = useState<Record<string, string>>(
    Object.fromEntries(summaries.map((s) => [s.card_type, s.default_settle_date]))
  );
  const [busyCard, setBusyCard] = useState<CardType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSettle(s: CardPendingSummary) {
    const settleDate = dates[s.card_type];
    if (!settleDate) {
      setError("결제일을 입력해주세요.");
      return;
    }
    if (
      !(await confirm(`${CARD_TYPE_LABELS[s.card_type]}카드 ${settleDate} 이전 사용내역을 ${settleDate} 결제일로 일괄 출금 처리하시겠습니까?`, { okLabel: "출금 처리" }))
    ) {
      return;
    }
    setError(null);
    setBusyCard(s.card_type);
    logDebug("CardSettle", `카드 결제일 일괄처리 시도: card=${s.card_type}, date=${settleDate}`);
    try {
      const result = await apiPost<{ settled_count: number; total_amount: number }>("/api/payments/card-settle", {
        card_type: s.card_type,
        settle_date: settleDate,
      });
      logDebug("CardSettle", `일괄처리 완료: count=${result.settled_count}, total=${result.total_amount}`);
      notify(`${result.settled_count}건, ${formatCurrency(result.total_amount)}을 ${settleDate} 출금으로 처리했습니다.`);
      onSuccess();
    } catch (err) {
      logError("CardSettle", "일괄처리 실패", err);
      setError(err instanceof ApiError ? err.message : "일괄 처리 중 오류가 발생했습니다.");
    } finally {
      setBusyCard(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg">
        <h3 className="text-sm font-semibold mb-1">카드 결제일 일괄처리</h3>
        <p className="text-xs text-text-muted mb-4">
          법인카드 사용내역은 결제 전까지 '결제예정'으로 쌓입니다. 사용기간은 매월 1일~말일이고 다음 달 결제일(휴일이면 다음 영업일)에 청구됩니다. 일괄 처리하면 출금 내역으로 확정되고 입출금 날짜가 결제일로 바뀝니다.
        </p>

        <div className="space-y-3 mb-4">
          {summaries.map((s) => (
            <div key={s.card_type} className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{CARD_TYPE_LABELS[s.card_type]}카드</span>
                <span className="text-sm">
                  {s.count}건 · {formatCurrency(s.total_amount)}
                </span>
              </div>
              {s.count > 0 ? (
                <>
                  <p className="text-xs text-text-muted mb-2">
                    {s.usage_from} ~ {s.usage_to} 사용분이 {s.default_settle_date}에 결제됩니다.
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-text-muted">결제일</label>
                    <input
                      type="date"
                      value={dates[s.card_type] ?? ""}
                      onChange={(e) => setDates((prev) => ({ ...prev, [s.card_type]: e.target.value }))}
                      className="text-sm border border-border rounded-lg px-2 py-1 bg-surface"
                    />
                    <button
                      type="button"
                      onClick={() => handleSettle(s)}
                      disabled={busyCard !== null}
                      className="ml-auto rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-1.5 transition-colors disabled:opacity-60"
                    >
                      {busyCard === s.card_type ? "처리 중..." : "일괄 처리"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-text-muted">
                  {s.usage_from} ~ {s.usage_to} 사용분({s.default_settle_date} 결제) 중 처리할 내역이 없습니다.
                </p>
              )}
              {s.later_count > 0 && (
                <p className="text-xs text-text-muted mt-2">
                  이후 사용분 {s.later_count}건 · {formatCurrency(s.later_amount)}은 다음 결제일에 처리됩니다.
                </p>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-xs text-danger mb-3">{error}</p>}

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
