/** 프로젝트 BOM(필요 자재와 수량): 서버 응답 모양과 화면에서 쓰는 상태 계산. */
export interface BomLine {
  id: number;
  material_id: number | null;
  /** 자재관리에 등록된 자재인가 */
  registered: boolean;
  code: string | null;
  item_name: string;
  category_label: string | null;
  sub_levels: string[];
  /** 제품 1개당 필요한 개수 */
  quantity: number;
  note: string | null;
  /** 연결된 자재의 현재 재고 (미등록이면 null) */
  current_qty: number | null;
  /** 제품 1개를 만들 때 재고가 모자라는 개수 (넉넉하거나 미등록이면 null) */
  shortage: number | null;
  /** 이 줄로 지금까지 출고한 개수 */
  released: number;
  /** 재고 부족으로 출고에서 빠져 나중에 따로 출고해야 하는 제품 개수 (0 이면 없음) */
  pending_units: number;
}

/** bad: 재고 부족 / warn: 미등록(재고 목록에 없음) / good: 재고 충분 */
export type BomState = "bad" | "warn" | "good";

export type BomFilter = "all" | BomState;

export const BOM_FILTERS: { key: BomFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "bad", label: "재고 부족" },
  { key: "warn", label: "미등록" },
  { key: "good", label: "충분" },
];

export function bomState(line: BomLine): BomState {
  if (!line.registered) return "warn";
  return line.shortage !== null && line.shortage > 0 ? "bad" : "good";
}

export function bomStateLabel(line: BomLine): string {
  const s = bomState(line);
  if (s === "warn") return "미등록";
  if (s === "bad") return `${(line.shortage ?? 0).toLocaleString("ko-KR")}개 부족`;
  return "충분";
}

export function bomCounts(lines: BomLine[]): Record<BomFilter, number> {
  const c: Record<BomFilter, number> = { all: lines.length, bad: 0, warn: 0, good: 0 };
  for (const l of lines) c[bomState(l)] += 1;
  return c;
}

/** 칩으로 거른 뒤 "조치 필요"(부족·미등록)와 "재고 충분"으로 나눈다. 같은 묶음 안에서는 등록한 순서를 지킨다. */
export function groupBom(lines: BomLine[], filter: BomFilter): { need: BomLine[]; ok: BomLine[] } {
  const shown = lines.filter((l) => filter === "all" || bomState(l) === filter);
  return { need: shown.filter((l) => bomState(l) !== "good"), ok: shown.filter((l) => bomState(l) === "good") };
}

/**
 * 출고 요약의 한 줄: 제품 units 개분에 필요한 개수(1개당 × units).
 * 재고가 필요한 개수 이상이면 통째로 출고하고(ok), 모자라거나 미등록이면 이번 출고에서 뺀다(부분 출고는 없다).
 * 재고가 모자라서 뺀 줄은 서버에 보류분으로 적어 두고 나중에 따로 출고한다.
 */
export interface ReleaseRow {
  line: BomLine;
  need: number;
  /** 이번에 출고하는가 (자재관리에 등록되어 있고 재고가 필요한 개수 이상) */
  ok: boolean;
  /** 재고가 모자라 이번에서 빠지는 줄인가 (등록은 되어 있으나 재고 부족) - 보류분으로 남는다 */
  held: boolean;
  /** 모자라는 개수 (held 일 때) */
  short: number;
}

export function bomReleaseRows(lines: BomLine[], units: number): ReleaseRow[] {
  return lines.map((line) => {
    const need = line.quantity * units;
    const stock = Math.max(line.current_qty ?? 0, 0);
    const ok = line.registered && stock >= need;
    return { line, need, ok, held: line.registered && !ok, short: line.registered && !ok ? need - stock : 0 };
  });
}

export function bomReleaseTotals(rows: ReleaseRow[]): { kinds: number; qty: number; held: number } {
  const picked = rows.filter((r) => r.ok);
  return { kinds: picked.length, qty: picked.reduce((s, r) => s + r.need, 0), held: rows.filter((r) => r.held).length };
}

/** 보류분(재고 부족으로 빠졌던 자재) 한 줄: 보류된 제품 개수 × 1개당 = 필요한 개수, 재고가 채워졌으면 지금 출고할 수 있다 */
export interface PendingRow {
  line: BomLine;
  need: number;
  ready: boolean;
  short: number;
}

export function bomPendingRows(lines: BomLine[]): PendingRow[] {
  return lines
    .filter((l) => l.registered && l.pending_units > 0)
    .map((line) => {
      const need = line.quantity * line.pending_units;
      const stock = Math.max(line.current_qty ?? 0, 0);
      return { line, need, ready: stock >= need, short: Math.max(need - stock, 0) };
    });
}
