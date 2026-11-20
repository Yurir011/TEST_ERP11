import type { HelpTopic } from "./helpContent";

function haystack(t: HelpTopic): string {
  return [
    t.title,
    t.summary,
    t.where ?? "",
    t.who ?? "",
    ...(t.steps ?? []),
    ...(t.notes ?? []),
    ...(t.problems ?? []).flatMap((p) => [p.q, p.a]),
    ...(t.keywords ?? []),
  ]
    .join("\n")
    .toLowerCase();
}

/** 공백으로 나눈 검색어가 모두 들어 있는 주제만 골라, 제목에 걸린 주제를 앞에 둔다. 검색어가 없으면 분류만 걸러 원래 순서대로 돌려준다. */
export function filterTopics(topics: HelpTopic[], query: string, category: string | null): HelpTopic[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const inCategory = category ? topics.filter((t) => t.category === category) : topics;
  if (terms.length === 0) return inCategory;
  const scored: { t: HelpTopic; score: number }[] = [];
  for (const t of inCategory) {
    const h = haystack(t);
    if (!terms.every((term) => h.includes(term))) continue;
    const title = t.title.toLowerCase();
    scored.push({ t, score: terms.filter((term) => title.includes(term)).length });
  }
  // 점수가 같으면 원래 순서를 유지 (Array.sort 는 안정 정렬)
  return scored.sort((a, b) => b.score - a.score).map((s) => s.t);
}
