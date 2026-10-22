export const PROGRESS_ROW_STYLES = [
  { bar: "bg-progress-1", dot: "bg-progress-1-fg" },
  { bar: "bg-progress-2", dot: "bg-progress-2-fg" },
  { bar: "bg-progress-3", dot: "bg-progress-3-fg" },
  { bar: "bg-progress-4", dot: "bg-progress-4-fg" },
  { bar: "bg-progress-5", dot: "bg-progress-5-fg" },
];

/**
 * 항목의 색 번호: 만든 순서(번호가 작은 순)대로 색을 돌려 쓴다.
 * 화면에 보이는 위치가 아니라 항목 자체에 색이 붙으므로 순서를 바꿔도 색이 따라간다.
 */
export function stageColorIndex(stages: { id: number }[], id: number): number {
  const rank = stages.filter((s) => s.id < id).length;
  return rank % PROGRESS_ROW_STYLES.length;
}
