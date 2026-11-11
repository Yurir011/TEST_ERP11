import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiGet, apiPost } from "../../lib/api";
import { isAdminRole } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { BulkLevelsModal } from "./BulkLevelsModal";
import { CodeText } from "./CodeText";
import { NewMaterialButton } from "./NewMaterialButton";
import { LIST_TABS, formatReelQty, levelPath, matchKeyword, matchTab, type ListTab, type Material } from "./types";

/** 자재관리 목록 (시안 B-2): 품목 코드 · 품명 · 분류(속성) · 개수 네 칸만 보여 준다. 위 탭으로 걸러 보고, 코드·품명·속성으로 찾는다. 행을 누르면 상세(입출고 기록)로 간다.
 *  앞의 체크박스로 여러 자재를 골라 분류를 한꺼번에 바꾸거나(직원 누구나), 한꺼번에 삭제할 수 있다(대표만). Shift+클릭으로 범위 선택. */
export function MaterialsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dialog = useDialog();
  const isAdmin = !!user && isAdminRole(user.role);
  const [rows, setRows] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>("all");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lastClicked, setLastClicked] = useState<number | null>(null);
  const [levelsOpen, setLevelsOpen] = useState(false);

  const load = useCallback(() => {
    logDebug("Materials", "자재 목록 조회 시작");
    return apiGet<Material[]>("/api/materials")
      .then((r) => {
        logDebug("Materials", `자재 목록 조회 성공: ${r.length}건`);
        setRows(r);
        setSelected((prev) => new Set([...prev].filter((id) => r.some((m) => m.id === id)))); // 사라진 자재는 선택에서도 뺀다
      })
      .catch((err) => {
        logError("Materials", "자재 목록 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "자재 목록을 불러오지 못했습니다.");
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => Object.fromEntries(LIST_TABS.map((t) => [t.key, (rows ?? []).filter((m) => matchTab(m, t.key)).length])), [rows]);
  // 이름 사전식(가나다·ABC, 숫자는 크기순: "저항 2" 다음에 "저항 10") 자동 정렬. 이름이 같으면 코드순
  const shown = useMemo(
    () =>
      (rows ?? [])
        .filter((m) => matchTab(m, tab) && matchKeyword(m, keyword))
        .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" }) || a.code.localeCompare(b.code)),
    [rows, tab, keyword],
  );

  const shownIds = shown.map((m) => m.id);
  const selectedInView = shownIds.filter((id) => selected.has(id)).length;
  const allInView = shownIds.length > 0 && selectedInView === shownIds.length;
  const targets = (rows ?? []).filter((m) => selected.has(m.id));

  const toggleRow = (id: number, checked: boolean, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      let ids = [id];
      if (shift && lastClicked !== null) {
        const a = shownIds.indexOf(lastClicked);
        const b = shownIds.indexOf(id);
        if (a >= 0 && b >= 0) ids = shownIds.slice(Math.min(a, b), Math.max(a, b) + 1);
      }
      ids.forEach((i) => (checked ? next.add(i) : next.delete(i)));
      return next;
    });
    setLastClicked(id);
  };

  const toggleAll = (checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      shownIds.forEach((i) => (checked ? next.add(i) : next.delete(i)));
      return next;
    });

  const deleteSelected = async () => {
    if (targets.length === 0) return;
    const withStock = targets.filter((m) => m.current_qty !== 0).length;
    const names = targets.slice(0, 5).map((m) => `· ${m.name} (${m.code})`).join("\n") + (targets.length > 5 ? `\n… 외 ${targets.length - 5}개` : "");
    const warn = withStock > 0 ? `\n\n재고가 남아 있는 자재가 ${withStock}개 포함되어 있습니다.` : "";
    const message = `자재 ${targets.length}개를 삭제할까요?\n\n${names}${warn}\n\n입출고 기록도 모두 함께 지워지고 되돌릴 수 없습니다.`;
    if (!(await dialog.confirm(message, { okLabel: `${targets.length}개 삭제`, danger: true }))) return;
    try {
      logDebug("Materials", `일괄 삭제 시도: ${targets.length}건`);
      await apiPost("/api/materials/bulk-delete", { ids: targets.map((m) => m.id) });
      logDebug("Materials", `일괄 삭제 성공: ${targets.length}건`);
      setSelected(new Set());
      setLastClicked(null);
      await load();
    } catch (err) {
      logError("Materials", "일괄 삭제 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
      await load(); // 이미 지워진 자재가 섞여 있었을 수 있으니 목록을 다시 맞춘다
    }
  };

  const btn = "rounded-lg border border-border bg-surface px-3 py-1.5 hover:bg-bg";

  return (
    <MainLayout
      title="자재관리"
      description="회로부품·사출물·부자재·포장재·소모품의 현재 개수와 입고·출고를 관리합니다."
      actions={<NewMaterialButton />}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {LIST_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`rounded-full border px-4 py-1.5 text-sm ${tab === t.key ? "border-primary bg-tile-blue text-tile-blue-fg font-semibold" : "border-border text-text-muted hover:bg-bg"}`}
          >
            {t.label} <span className="text-xs opacity-70">{counts[t.key]}</span>
          </button>
        ))}
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="코드·품명·속성 검색"
          aria-label="자재 검색"
          className="ml-auto w-64 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-surface"
        />
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl border border-primary bg-tile-blue px-4 py-2.5 text-sm">
          <span className="text-tile-blue-fg mr-1">
            <strong>{selected.size}</strong>개 선택됨
          </span>
          {!allInView && shownIds.length > 0 && (
            <button type="button" onClick={() => toggleAll(true)} className={btn}>
              현재 목록 모두 선택
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={() => setSelected(new Set())} className={btn}>
            선택 해제
          </button>
          <button type="button" onClick={() => setLevelsOpen(true)} className={btn}>
            분류 변경
          </button>
          {isAdmin && (
            <button type="button" onClick={() => void deleteSelected()} className="rounded-lg bg-danger px-3 py-1.5 font-semibold text-white hover:opacity-90">
              선택 삭제
            </button>
          )}
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px] table-fixed">
          <colgroup>
            <col className="w-11" />
            <col className="w-36" />
            <col className="w-[28%]" />
            <col />
            <col className="w-32" />
          </colgroup>
          <thead className="text-text-muted text-xs">
            <tr className="text-left border-b border-border">
              <th className="py-3 pl-4 pr-0 w-px">
                <input
                  type="checkbox"
                  aria-label="현재 목록 전체 선택"
                  checked={allInView}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedInView > 0 && !allInView;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="py-3 px-5 font-medium whitespace-nowrap">품목 코드</th>
              <th className="py-3 px-5 font-medium">품명</th>
              <th className="py-3 px-5 font-medium">분류</th>
              <th className="py-3 px-5 font-medium text-right whitespace-nowrap">개수</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-text-muted">
                  불러오는 중...
                </td>
              </tr>
            )}
            {rows !== null && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-text-muted">
                  {rows.length === 0 ? "등록된 자재가 없습니다. [자재 등록]으로 추가해 주세요." : "조건에 맞는 자재가 없습니다."}
                </td>
              </tr>
            )}
            {shown.map((m) => (
              <tr
                key={m.id}
                onClick={() => navigate(`/materials/${m.id}`)}
                className={`border-b border-border last:border-0 cursor-pointer hover:bg-bg ${selected.has(m.id) ? "bg-tile-blue" : ""}`}
              >
                <td className="py-3 pl-4 pr-0 w-px" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`${m.name} 선택`}
                    checked={selected.has(m.id)}
                    onChange={() => undefined}
                    onClick={(e) => toggleRow(m.id, e.currentTarget.checked, e.shiftKey)}
                  />
                </td>
                <td className="py-3 px-5 whitespace-nowrap">
                  <CodeText code={m.code} />
                </td>
                <td className="py-3 px-5 truncate font-semibold" title={m.name}>
                  {m.name}
                </td>
                <td className="py-3 px-5 truncate text-text-muted" title={levelPath(m.sub_levels)}>
                  {levelPath(m.sub_levels) || "-"}
                </td>
                <td className="py-3 px-5 text-right font-bold tabular-nums whitespace-nowrap">{formatReelQty(m.current_qty, m.current_reels)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {levelsOpen && (
        <BulkLevelsModal
          targets={targets}
          onClose={() => setLevelsOpen(false)}
          onSaved={() => {
            setLevelsOpen(false);
            setSelected(new Set());
            setLastClicked(null);
            void load();
          }}
        />
      )}
    </MainLayout>
  );
}
