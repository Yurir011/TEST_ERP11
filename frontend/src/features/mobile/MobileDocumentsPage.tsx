import { FileText, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuth } from "../../context/useAuth";
import { openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { DOC_FILTERS, filterDocSearchItems, loadDocSearchItems, type DocFilter, type DocSearchItem } from "./documentSearch";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

const PAGE_SIZE = 30;

function shortDate(date: string) {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 서류 찾기(읽기 전용): 견적서·거래명세서·세금계산서·발주서·품의서·증명서를 종류별로 찾고, 결재가 끝난 서류는 PDF로 본다. */
export function MobileDocumentsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<DocSearchItem[] | null>(null);
  const [filter, setFilter] = useState<DocFilter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDocSearchItems(user).then(setItems);
  }, [user]);

  const rows = useMemo(() => (items ? filterDocSearchItems(items, filter, query) : []), [items, filter, query]);

  async function handleOpen(item: DocSearchItem) {
    if (!item.pdfPath) return;
    setError(null);
    try {
      logDebug("MobileDocuments", `PDF 열기: ${item.key}`);
      await openFile(item.pdfPath);
    } catch (err) {
      logError("MobileDocuments", `PDF 열기 실패: ${item.key}`, err);
      setError("문서를 열지 못했습니다.");
    }
  }

  return (
    <MobileLayout title="서류">
      <label className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 text-text-muted">
        <Search size={16} aria-hidden />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE_SIZE);
          }}
          placeholder="제목·거래처·작성자 검색"
          aria-label="서류 검색"
          className="flex-1 min-w-0 bg-transparent py-2.5 text-base text-text outline-none"
        />
      </label>

      <div role="group" aria-label="서류 종류" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {DOC_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => {
              setFilter(f.key);
              setShown(PAGE_SIZE);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold ${
              filter === f.key ? "bg-primary border-primary text-on-primary" : "bg-surface border-border text-text-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-xs bg-tile-blue text-tile-blue-fg rounded-xl px-3 py-2">서류 작성과 수정은 PC에서 합니다. 여기서는 찾고 보고 PDF를 열 수 있어요.</p>
      {error && <p className="text-xs text-danger px-1">{error}</p>}

      {items === null ? (
        <p className="text-xs text-text-muted text-center py-10">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <MobileEmpty text="찾는 서류가 없습니다." />
      ) : (
        <>
          <p className="text-xs text-text-muted px-1">{rows.length}건</p>
          {rows.slice(0, shown).map((item) => (
            <MobileCard key={item.key} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 ${SOFT_BADGE.blue}`}>{item.kindLabel}</span>
                {item.status === "draft" ? (
                  <span className={`text-xs px-2 py-1 font-medium ${SOFT_BADGE.gray}`}>작성 중</span>
                ) : (
                  <StatusBadge status={item.status} />
                )}
              </div>
              <p className="text-sm font-semibold break-words">{item.title}</p>
              <p className="text-xs text-text-muted break-words">{item.subtitle}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-text-muted tabular-nums">
                  {shortDate(item.date)}
                  {item.amount ? ` · ${item.amount}` : ""}
                </p>
                {item.pdfPath ? (
                  <button type="button" onClick={() => handleOpen(item)} className="flex items-center gap-1 text-xs text-primary font-medium">
                    <FileText size={14} aria-hidden />
                    PDF 보기
                  </button>
                ) : (
                  <span className="text-[11px] text-text-muted">결재 승인 후 PDF를 볼 수 있어요</span>
                )}
              </div>
            </MobileCard>
          ))}
          {rows.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
              className="w-full border border-border rounded-xl py-2.5 text-sm text-text-muted"
            >
              더 보기 ({rows.length - shown}건 남음)
            </button>
          )}
        </>
      )}
    </MobileLayout>
  );
}
