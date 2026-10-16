import type { Client } from "../clients/types";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { formatCurrency } from "../../lib/format";
import type { OutstandingKind, OutstandingRow } from "./outstanding";
import { CARD_TYPE_LABELS, type CardType } from "./types";

export interface CardPendingRow {
  cardType: CardType;
  count: number;
  amount: number;
}

interface OutstandingCardsProps {
  receivableRows: OutstandingRow[];
  payableRows: OutstandingRow[];
  receivableTotal: number;
  payableTotal: number;
  /** 월별 보기일 때 제목 옆에 붙는 " (10월 발생분)" 같은 문구. 전체 보기는 빈 문자열 */
  periodLabel: string;
  /** 월별 조회가 아직 끝나지 않아 "불러오는 중"을 보여줄지 */
  loading: boolean;
  cardRows: CardPendingRow[];
  cardTotal: number;
  occurredLabel: (kind: OutstandingKind, clientId: number) => string | null;
  partialPaidLabel: (kind: OutstandingKind, clientId: number) => string | null;
  onOpenDetail: (kind: OutstandingKind, client: Client) => void;
  onSettle: (kind: OutstandingKind, client: Client) => void;
  onOpenCardDetail: (cardType: CardType) => void;
}

const CARD_STYLES = [
  {
    kind: "receivable",
    title: "미수금",
    empty: "미수금",
    action: "수금 처리",
    style: "text-primary border-primary/30 hover:bg-tile-blue",
    totalClass: "text-success",
  },
  {
    kind: "payable",
    title: "미지급금",
    empty: "미지급금",
    action: "지급 처리",
    style: "text-danger border-danger/30 hover:bg-red-50",
    totalClass: "text-notify",
  },
] as const;

// 입출금관리 상단의 3개 요약 카드: 미수금 / 미지급금 / 카드 결제예정.
export function OutstandingCards(props: OutstandingCardsProps) {
  const { periodLabel, loading, cardRows, cardTotal, occurredLabel, partialPaidLabel } = props;
  const rowsOf = (kind: OutstandingKind) => (kind === "receivable" ? props.receivableRows : props.payableRows);
  const totalOf = (kind: OutstandingKind) => (kind === "receivable" ? props.receivableTotal : props.payableTotal);

  return (
    <section className="grid grid-cols-3 gap-4 mb-6">
      {CARD_STYLES.map((card) => {
        const rows = rowsOf(card.kind);
        return (
          <div key={card.kind} className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="text-sm font-medium">
              {card.title}
              <span className="text-xs font-normal text-text-muted">{periodLabel}</span>
            </h2>
            <p className={`text-[17px] font-semibold tabular-nums mt-1 mb-3 ${card.totalClass}`}>{formatCurrency(totalOf(card.kind))}</p>
            {loading ? (
              <p className="text-sm text-text-muted">불러오는 중...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-text-muted">{card.empty}이 있는 거래처가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map(({ client: c, amount }) => (
                  <li
                    key={c.id}
                    onClick={() => props.onOpenDetail(card.kind, c)}
                    title="상세 내역 보기"
                    className="bg-bg rounded-xl px-4 py-3 cursor-pointer hover:bg-border/40 transition-colors"
                  >
                    {/* 두 줄: 윗줄 = 거래처명 ←→ 금액, 아랫줄 = 발생일 ←→ 처리 버튼. 칸 어디를 눌러도 상세가 열리고, 처리 버튼만 별도로 동작한다. */}
                    <div className="flex items-center justify-between gap-2 w-full text-left">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium truncate min-w-0">{c.name}</span>
                        {partialPaidLabel(card.kind, c.id) && (
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${SOFT_BADGE.orange}`}>
                            {card.kind === "receivable" ? "수금" : "지급"}(일부)
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(amount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-xs text-text-muted min-w-0">
                        {occurredLabel(card.kind, c.id) && `${card.title} 발생일 ${occurredLabel(card.kind, c.id)}`}
                        {partialPaidLabel(card.kind, c.id) &&
                          ` · ${card.kind === "receivable" ? "수금" : "지급"}(일부) ${partialPaidLabel(card.kind, c.id)}`}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onSettle(card.kind, c);
                        }}
                        className={`text-[11px] font-medium border bg-surface rounded-full px-2.5 py-1 shrink-0 transition-colors ${card.style}`}
                      >
                        {card.action}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <div className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="text-sm font-medium">
          카드 결제예정
          <span className="text-xs font-normal text-text-muted">{periodLabel}</span>
        </h2>
        <p className="text-[17px] font-semibold tabular-nums mt-1 mb-3 text-notify">{formatCurrency(cardTotal)}</p>
        {cardRows.length === 0 ? (
          <p className="text-sm text-text-muted">결제 예정인 카드 사용내역이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {cardRows.map((r) => (
              <li key={r.cardType}>
                <button
                  type="button"
                  onClick={() => props.onOpenCardDetail(r.cardType)}
                  title="세부 사용내역 보기"
                  className="w-full flex items-center justify-between gap-2 bg-bg rounded-xl px-4 py-3 text-left hover:opacity-70"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{CARD_TYPE_LABELS[r.cardType]}카드</span>
                    <span className="block text-xs text-text-muted mt-0.5">{r.count}건</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(r.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
