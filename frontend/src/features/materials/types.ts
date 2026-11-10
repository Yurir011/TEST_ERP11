import { SOFT_BADGE } from "../../components/ui/softBadge";

// "ic" 는 저장 값이고 화면에는 "회로부품"으로 보인다.
export type MaterialCategory = "ic" | "injection" | "subsidiary" | "consumable";

/** 자재 항목(분류) 4가지. 순서는 탭·선택 버튼에 보이는 순서다. */
export const CATEGORY_ORDER: MaterialCategory[] = ["ic", "injection", "subsidiary", "consumable"];

export const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  ic: "회로부품",
  injection: "사출물",
  subsidiary: "부자재",
  consumable: "소모품",
};

/** 항목 배지 색: 회로부품 파랑, 사출물 주황, 부자재 초록, 소모품 보라 */
export const CATEGORY_BADGE: Record<MaterialCategory, string> = {
  ic: SOFT_BADGE.blue,
  injection: SOFT_BADGE.orange,
  subsidiary: SOFT_BADGE.green,
  consumable: SOFT_BADGE.purple,
};

/** 항목 선택 탭의 밑줄 색 (테마 색 변수) */
export const CATEGORY_COLOR: Record<MaterialCategory, string> = {
  ic: "var(--color-tile-blue-fg)",
  injection: "var(--color-tile-orange-fg)",
  subsidiary: "var(--color-tile-green-fg)",
  consumable: "var(--color-tile-purple-fg)",
};

/** 출고 사유 선택지. 나중에 회사에서 쓰는 사유로 고칠 수 있다 (여기만 바꾸면 화면에 반영된다). */
export const OUT_REASONS = ["시제품 제작", "생산 불출", "불량·폐기", "샘플 제공", "반품", "기타"];

/** 속성은 기본으로 3칸을 보여 주고, 필요하면 이 단계까지 늘려 쓴다 (서버 MAX_SUB_LEVELS 와 같다). */
export const MIN_LEVEL_SLOTS = 3;
export const MAX_LEVEL_SLOTS = 10;

export type MovementKind = "in" | "add" | "out";

export const KIND_LABELS: Record<MovementKind, string> = { in: "입고", add: "추가 입고", out: "출고" };

export interface MovementBrief {
  movement_date: string;
  quantity: number;
}

export interface Material {
  id: number;
  category: MaterialCategory;
  category_label: string;
  name: string;
  sub_levels: string[];
  current_qty: number;
  last_in: MovementBrief | null;
  last_out: MovementBrief | null;
  updated_at: string;
}

export interface Movement {
  id: number;
  kind: MovementKind;
  movement_date: string;
  quantity: number;
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
  movements: Movement[];
}

export interface MaterialInput {
  category: MaterialCategory;
  name: string;
  sub_levels: string[];
  memo: string | null;
  initial_in?: { movement_date: string; quantity: number } | null;
}

/** 이 자재가 지금 개수가 적은지 (목록에서 '부족' 표시) 는 기준을 정하기 전이라 쓰지 않는다. 필요해지면 여기에 기준을 둔다. */
export function formatQty(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 항목 이름 뒤에 속성을 '›' 로 이은 글 (목록·상세 머리글용). 비어 있으면 빈 글. */
export function levelPath(levels: string[]): string {
  return levels.join(" › ");
}
