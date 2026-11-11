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
  quantity: number;
  note: string | null;
  /** 연결된 자재의 현재 재고 (미등록이면 null) */
  current_qty: number | null;
  /** 재고가 모자라는 개수 (넉넉하거나 미등록이면 null) */
  shortage: number | null;
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
