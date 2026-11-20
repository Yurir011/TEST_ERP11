import { ChevronDown, ChevronRight, CircleAlert, MapPin, Search, UserCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "../../components/layout/MainLayout";
import { logDebug } from "../../lib/logger";
import { HELP_CATEGORIES, HELP_TOPICS, type HelpTopic } from "./helpContent";
import { filterTopics } from "./helpSearch";

const AUTO_OPEN_MAX = 3; // 검색 결과가 이 개수 이하면 내용을 바로 펼쳐 보여 준다

function TopicCard({ topic, open, onToggle, showCategory }: { topic: HelpTopic; open: boolean; onToggle: () => void; showCategory: boolean }) {
  const categoryLabel = HELP_CATEGORIES.find((c) => c.id === topic.category)?.label;
  return (
    <article className="rounded-xl border border-border bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left hover:bg-bg"
      >
        <span className="mt-0.5 shrink-0 text-text-muted">{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] text-text">{topic.title}</b>
          <span className="mt-0.5 block text-sm text-text-muted">{topic.summary}</span>
        </span>
        {showCategory && categoryLabel && <span className="ml-2 hidden shrink-0 rounded-full bg-tile-blue px-2.5 py-0.5 text-xs font-medium text-tile-blue-fg sm:inline">{categoryLabel}</span>}
      </button>

      {open && (
        <div className="space-y-5 border-t border-border px-5 py-4 text-sm leading-relaxed text-text">
          {(topic.where || topic.who) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {topic.where && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-bg px-2.5 py-1.5 text-text-muted">
                  <MapPin size={13} aria-hidden="true" />
                  <span>
                    <b className="font-semibold text-text">위치</b> {topic.where}
                  </span>
                </span>
              )}
              {topic.who && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-bg px-2.5 py-1.5 text-text-muted">
                  <UserCheck size={13} aria-hidden="true" />
                  <span>
                    <b className="font-semibold text-text">권한</b> {topic.who}
                  </span>
                </span>
              )}
            </div>
          )}

          {topic.steps && topic.steps.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">이렇게 하세요</h3>
              <ol className="space-y-2">
                {topic.steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-tile-blue text-xs font-semibold text-tile-blue-fg">{i + 1}</span>
                    <span className="min-w-0 flex-1">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {topic.notes && topic.notes.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">알아 두세요</h3>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-text-muted">
                {topic.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          {topic.problems && topic.problems.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <CircleAlert size={15} className="text-danger" aria-hidden="true" />
                이런 문구가 나오면
              </h3>
              <div className="space-y-2">
                {topic.problems.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border bg-bg px-3.5 py-2.5">
                    <p className="font-medium text-danger">{p.q}</p>
                    <p className="mt-1 text-text">{p.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </article>
  );
}

export function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());

  useEffect(() => {
    logDebug("Help", `도움말 화면 열림: 주제 ${HELP_TOPICS.length}개`);
  }, []);

  const results = useMemo(() => filterTopics(HELP_TOPICS, query, category), [query, category]);
  const searching = query.trim().length > 0;
  const autoOpen = searching && results.length <= AUTO_OPEN_MAX;

  const counts = useMemo(() => {
    const base = filterTopics(HELP_TOPICS, query, null);
    const m = new Map<string, number>();
    for (const t of base) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return { total: base.length, byCategory: m };
  }, [query]);

  function toggle(id: string) {
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isOpen(id: string) {
    // 검색 결과가 적으면 기본으로 펼쳐 두고, 눌러서 접을 수 있다
    return autoOpen !== opened.has(id);
  }

  function renderCards(list: HelpTopic[], showCategory: boolean) {
    return (
      <div className="space-y-2.5">
        {list.map((t) => (
          <TopicCard key={t.id} topic={t} open={isOpen(t.id)} onToggle={() => toggle(t.id)} showCategory={showCategory} />
        ))}
      </div>
    );
  }

  return (
    <MainLayout title="도움말" description="BENCH ERP의 기능 사용법과 문제 해결 방법을 모았습니다. 궁금한 말이나 화면에 나온 문구를 검색해 보세요.">
      <div className="max-w-4xl">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            id="help-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 연차 신청, 세금계산서 발행, 카드 리더, 결재 회수"
            aria-label="도움말 검색"
            className="w-full rounded-xl border border-border bg-white py-3 pl-10 pr-10 text-sm outline-none focus:border-primary"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-text-muted hover:bg-bg">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="분류">
          <button
            type="button"
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${category === null ? "border-primary bg-tile-blue font-semibold text-tile-blue-fg" : "border-border bg-white text-text-muted hover:border-primary"}`}
          >
            전체 <span className="tabular-nums">{counts.total}</span>
          </button>
          {HELP_CATEGORIES.map((c) => {
            const n = counts.byCategory.get(c.id) ?? 0;
            if (searching && n === 0) return null;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                title={c.description}
                onClick={() => setCategory(category === c.id ? null : c.id)}
                className={`rounded-full border px-3.5 py-1.5 text-sm ${category === c.id ? "border-primary bg-tile-blue font-semibold text-tile-blue-fg" : "border-border bg-white text-text-muted hover:border-primary"}`}
              >
                {c.label} <span className="tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-white px-6 py-10 text-center">
              <p className="font-medium text-text">'{query}'에 맞는 도움말이 없습니다.</p>
              <p className="mt-1.5 text-sm text-text-muted">다른 말로 검색하거나 분류를 [전체]로 바꿔 보세요. 화면에 나온 빨간 문구의 일부만 입력해도 찾을 수 있습니다.</p>
            </div>
          ) : searching || category ? (
            <>
              <p className="mb-3 text-sm text-text-muted">
                {results.length}개의 도움말{autoOpen ? "" : " (제목을 누르면 펼쳐집니다)"}
              </p>
              {renderCards(results, true)}
            </>
          ) : (
            <div className="space-y-8">
              {HELP_CATEGORIES.map((c) => {
                const list = results.filter((t) => t.category === c.id);
                if (list.length === 0) return null;
                return (
                  <section key={c.id} aria-label={c.label}>
                    <div className="mb-3 flex items-baseline gap-2">
                      <h2 className="text-base font-semibold text-text">{c.label}</h2>
                      <span className="text-sm text-text-muted">{c.description}</span>
                    </div>
                    {renderCards(list, false)}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
