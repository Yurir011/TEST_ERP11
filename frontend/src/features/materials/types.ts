import { SOFT_BADGE } from "../../components/ui/softBadge";

// "ic" 는 저장 값이고 화면에는 "회로부품"으로 보인다.
export type MaterialCategory = "ic" | "injection" | "subsidiary" | "packaging" | "consumable";

/** 회로부품만 전용 / 범용 으로 나눈다. */
export type MaterialKind = "dedicated" | "general";
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = { dedicated: "전용", general: "범용" };
export const MATERIAL_KIND_ORDER: MaterialKind[] = ["dedicated", "general"];

/** 자재 항목(분류) 5가지. 순서는 탭·선택 버튼에 보이는 순서다. */
export const CATEGORY_ORDER: MaterialCategory[] = ["ic", "injection", "subsidiary", "packaging", "consumable"];

export const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  ic: "회로부품",
  injection: "사출물",
  subsidiary: "부자재",
  packaging: "포장재",
  consumable: "소모품",
};

/** 항목 배지 색: 회로부품 파랑, 사출물 주황, 부자재 초록, 소모품 보라 */
export const CATEGORY_BADGE: Record<MaterialCategory, string> = {
  ic: SOFT_BADGE.blue,
  injection: SOFT_BADGE.orange,
  subsidiary: SOFT_BADGE.green,
  packaging: SOFT_BADGE.red,
  consumable: SOFT_BADGE.gray,
};

/** 항목 선택 탭의 밑줄 색 (테마 색 변수) */
export const CATEGORY_COLOR: Record<MaterialCategory, string> = {
  ic: "var(--color-tile-blue-fg)",
  injection: "var(--color-tile-orange-fg)",
  subsidiary: "var(--color-tile-green-fg)",
  packaging: "var(--color-danger)",
  consumable: "var(--color-tile-gray-fg)",
};

/** 출고 사유 선택지. 나중에 회사에서 쓰는 사유로 고칠 수 있다 (여기만 바꾸면 화면에 반영된다). */
export const OUT_REASONS = ["시제품 제작", "생산 불출", "불량·폐기", "샘플 제공", "반품", "기타"];

/** 속성은 기본으로 3칸을 보여 주고, 필요하면 이 단계까지 늘려 쓴다 (서버 MAX_SUB_LEVELS 와 같다). */
export const MIN_LEVEL_SLOTS = 3;
export const MAX_LEVEL_SLOTS = 10;

export type MovementKind = "in" | "add" | "return" | "out";

export const KIND_LABELS: Record<MovementKind, string> = { in: "입고", add: "입고", return: "재입고", out: "출고" };

export interface MovementBrief {
  movement_date: string;
  quantity: number;
  reels?: number | null;
  reel_groups?: ReelGroup[] | null;
}

/** 릴 묶음: per_reel 개짜리 릴이 reels 개. 릴마다 개수가 다르면 묶음이 여러 개다. */
export interface ReelGroup {
  per_reel: number;
  reels: number;
}

export interface Material {
  id: number;
  code: string;
  category: MaterialCategory;
  category_label: string;
  kind: MaterialKind | null;
  kind_label: string | null;
  name: string;
  sub_levels: string[];
  current_qty: number;
  current_reels: number | null;
  last_in: MovementBrief | null;
  last_out: MovementBrief | null;
  updated_at: string;
}

export interface Movement {
  id: number;
  kind: MovementKind;
  movement_date: string;
  quantity: number;
  reels: number | null;
  reel_groups: ReelGroup[] | null;
  /** 재입고: 반납 대상 출고 기록 id, 그중 사용한 개수(안 적었으면 null) */
  return_of: number | null;
  used_qty: number | null;
  /** 출고: 재입고된 개수 합계 / 사용 합계 / 로스(출고 − 반납 − 사용). 재입고가 없거나 사용 개수를 안 적었으면 null */
  returned_qty: number | null;
  used_total: number | null;
  loss_qty: number | null;
  reason: string | null;
  note: string | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
}

export interface MaterialDetail extends Material {
  memo: string | null;
  total_in: number;
  total_add: number;
  total_out: number;
  total_return: number;
  total_loss: number;
  movements: Movement[];
}

export interface MaterialInput {
  category: MaterialCategory;
  kind: MaterialKind | null;
  name: string;
  sub_levels: string[];
  memo: string | null;
  initial_in?: ({ movement_date: string } & QtyPayload) | null;
}

/** 서버에 보내는 수량: 개로 적으면 quantity, 릴로 적으면 릴 수와 1릴 당 개수 (총 개수는 서버가 곱해서 정한다). */
export type QtyPayload = { quantity: number } | { reel_groups: ReelGroup[] };

/** 목록 탭: 전체 / 회로부품 전용 / 회로부품 범용 / 사출물 / 부자재 / 포장재 / 소모품 */
export type ListTab = "all" | "ic:dedicated" | "ic:general" | Exclude<MaterialCategory, "ic">;
export const LIST_TABS: { key: ListTab; label: string; short: string }[] = [
  { key: "all", label: "전체", short: "전체" },
  { key: "ic:dedicated", label: "회로부품 전용", short: "전용" },
  { key: "ic:general", label: "회로부품 범용", short: "범용" },
  { key: "injection", label: "사출물", short: "사출물" },
  { key: "subsidiary", label: "부자재", short: "부자재" },
  { key: "packaging", label: "포장재", short: "포장재" },
  { key: "consumable", label: "소모품", short: "소모품" },
];

export function matchTab(m: Pick<Material, "category" | "kind">, tab: ListTab): boolean {
  if (tab === "all") return true;
  if (tab === "ic:dedicated" || tab === "ic:general") return m.category === "ic" && m.kind === tab.slice(3);
  return m.category === tab;
}

/** 목록 검색: 코드·이름·속성·분류 어디에 들어 있어도 찾는다. */
export function matchKeyword(m: Pick<Material, "code" | "name" | "sub_levels" | "category_label" | "kind_label">, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  return !q || `${m.code} ${m.name} ${m.sub_levels.join(" ")} ${m.category_label} ${m.kind_label ?? ""}`.toLowerCase().includes(q);
}

/** 릴별 내역 글: "2,500개 × 2릴 + 2,480개 × 1릴". 릴이 아니면 빈 글. */
export function formatReelGroups(groups?: ReelGroup[] | null): string {
  return (groups ?? []).map((g) => `${formatQty(g.per_reel)}개 × ${formatQty(g.reels)}릴`).join(" + ");
}

/** 입고(구매분): 처음 입고 + 추가 입고. 재입고(반납)는 새로 들어온 물량이 아니므로 넣지 않는다. */
export const purchasedQty = (m: Pick<MaterialDetail, "total_in" | "total_add">): number => m.total_in + m.total_add;

/** 순 출고(실제 사용): 출고에서 재입고(반납)를 뺀 값. 현재 개수 = 입고(구매분) − 순 출고. */
export const netOutQty = (m: Pick<MaterialDetail, "total_out" | "total_return">): number => m.total_out - m.total_return;

/** 이력 탭: 전체 / 입고(입고 + 추가 입고) / 재입고 / 출고 */
export type HistoryTab = "all" | "in" | "return" | "out";
export const HISTORY_TABS: { key: HistoryTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "in", label: "입고" },
  { key: "return", label: "재입고" },
  { key: "out", label: "출고" },
];
export function matchHistoryTab(x: Pick<Movement, "kind">, tab: HistoryTab): boolean {
  return tab === "all" || (tab === "in" ? x.kind === "in" || x.kind === "add" : x.kind === tab);
}

/** 개수를 글로: 릴로 기록했으면 "3릴 (7,500개)", 개로만 기록했으면 "500개". */
export function formatReelQty(quantity: number, reels?: number | null): string {
  return reels != null ? `${formatQty(reels)}릴 (${formatQty(quantity)}개)` : `${formatQty(quantity)}개`;
}

/** 항목 이름 뒤에 종류(전용/범용)와 속성을 이은 글 (분류 칸용): "회로부품 · 전용 · MCU › Cortex-M3". */
export function classLabel(m: Pick<Material, "category_label" | "kind_label" | "sub_levels">): string {
  return [m.category_label, m.kind_label, levelPath(m.sub_levels)].filter(Boolean).join(" · ");
}

/** 이 자재가 지금 개수가 적은지 (목록에서 '부족' 표시) 는 기준을 정하기 전이라 쓰지 않는다. 필요해지면 여기에 기준을 둔다. */
export function formatQty(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 항목 이름 뒤에 속성을 '›' 로 이은 글 (목록·상세 머리글용). 비어 있으면 빈 글. */
export function levelPath(levels: string[]): string {
  return levels.join(" › ");
}
