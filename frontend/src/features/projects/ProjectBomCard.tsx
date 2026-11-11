import { useCallback, useEffect, useMemo, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { CodeText } from "../materials/CodeText";
import { levelPath, type Material, type MaterialDetail } from "../materials/types";
import { BOM_FILTERS, bomCounts, bomState, bomStateLabel, groupBom, type BomFilter, type BomLine, type BomState } from "./bom";
import { BomRegisterModal } from "./BomRegisterModal";

const STATE_BADGE: Record<BomState, string> = { bad: SOFT_BADGE.red, warn: SOFT_BADGE.orange, good: SOFT_BADGE.green };
const TILE_TEXT: Record<BomFilter, string> = { all: "", bad: "text-danger", warn: "text-tile-orange-fg", good: "text-success" };
const ROW_GRID = "grid grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-3 px-5";
const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg";
const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 프로젝트(=제품 생산)의 "BOM 등록" 카드: 이 프로젝트에 필요한 자재와 수량.
 * 위 칩(전체·재고 부족·미등록·충분)으로 걸러 보고, 부족·미등록은 "조치 필요" 묶음으로 맨 위에 모인다.
 * 줄을 누르면 오른쪽 패널에서 수량·비고를 고치거나 지운다. 자재관리(재고 목록)에 없는 자재는 경고와 함께 등록할 수 있다.
 * 자동 출고는 아직 없다.
 */
export function ProjectBomCard({ projectId }: { projectId: number }) {
  const dialog = useDialog();
  const [lines, setLines] = useState<BomLine[] | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BomFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftQty, setDraftQty] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [panelBusy, setPanelBusy] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  // 추가 입력줄
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [addQty, setAddQty] = useState("");
  const [addNote, setAddNote] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [warnFor, setWarnFor] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // 자재관리에 등록하는 창: "new" = 추가 입력줄의 이름, 숫자 = 그 BOM 줄을 연결
  const [registerFor, setRegisterFor] = useState<{ target: "new" | number; name: string } | null>(null);

  const loadLines = useCallback(() => {
    logDebug("ProjectBom", `BOM 조회 시작: project_id=${projectId}`);
    return apiGet<BomLine[]>(`/api/projects/${projectId}/bom`)
      .then((r) => {
        logDebug("ProjectBom", `BOM 조회 성공: ${r.length}건`);
        setLines(r);
        setError(null);
      })
      .catch((err) => {
        logError("ProjectBom", "BOM 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "BOM을 불러오지 못했습니다.");
      });
  }, [projectId]);

  const loadMaterials = useCallback(() => {
    return apiGet<Material[]>("/api/materials")
      .then(setMaterials)
      .catch((err) => logError("ProjectBom", "자재 목록 조회 실패 (자재관리 권한이 없으면 검색 목록이 비어 있습니다)", err));
  }, []);

  useEffect(() => {
    void loadLines();
    void loadMaterials();
  }, [loadLines, loadMaterials]);

  const counts = useMemo(() => bomCounts(lines ?? []), [lines]);
  const groups = useMemo(() => groupBom(lines ?? [], filter), [lines, filter]);
  const selected = lines?.find((l) => l.id === selectedId) ?? null;
  const usedMaterialIds = useMemo(() => new Set((lines ?? []).flatMap((l) => (l.material_id === null ? [] : [l.material_id]))), [lines]);

  useEffect(() => {
    setDraftQty(selected ? String(selected.quantity) : "");
    setDraftNote(selected?.note ?? "");
    setPanelError(null);
  }, [selected]);

  const matches = useMemo(() => {
    const s = query.trim().toLowerCase();
    const found = s ? materials.filter((m) => `${m.code} ${m.name} ${m.sub_levels.join(" ")}`.toLowerCase().includes(s)) : materials;
    return found.slice(0, 8);
  }, [materials, query]);
  const picked = pickedId === null ? null : (materials.find((m) => m.id === pickedId) ?? null);

  function resetAdd() {
    setQuery("");
    setPickedId(null);
    setAddQty("");
    setAddNote("");
    setWarnFor(null);
    setAddError(null);
    setListOpen(false);
  }

  async function addLine(materialId: number | null, name: string) {
    setAdding(true);
    setAddError(null);
    try {
      logDebug("ProjectBom", `BOM 추가 시도: project_id=${projectId}, material_id=${materialId}, name=${name}, qty=${addQty}`);
      const body = { material_id: materialId, item_name: materialId === null ? name : null, quantity: Number(addQty), note: addNote.trim() || null };
      const created = await apiPost<BomLine>(`/api/projects/${projectId}/bom`, body);
      logDebug("ProjectBom", `BOM 추가 성공: line_id=${created.id}`);
      resetAdd();
      await loadLines();
      dialog.notify(materialId === null ? "미등록 자재로 추가했습니다. 나중에 [자재관리에 등록]으로 연결할 수 있습니다." : "BOM에 추가했습니다.");
    } catch (err) {
      logError("ProjectBom", "BOM 추가 실패", err);
      setAddError(err instanceof ApiError ? err.message : "추가하지 못했습니다.");
    } finally {
      setAdding(false);
    }
  }

  function handleAdd() {
    setAddError(null);
    setWarnFor(null);
    const qty = Number(addQty);
    if (picked) {
      if (!(qty > 0)) return setAddError("필요 수량을 1 이상으로 입력해 주세요.");
      void addLine(picked.id, picked.name);
      return;
    }
    const text = query.trim();
    if (!text) return setAddError("자재를 검색해서 고르거나 이름을 입력해 주세요.");
    if (!(qty > 0)) return setAddError("필요 수량을 1 이상으로 입력해 주세요.");
    const exact = materials.filter((m) => m.name.trim().toLowerCase() === text.toLowerCase());
    if (exact.length === 1) {
      if (usedMaterialIds.has(exact[0].id)) return setAddError("이미 BOM에 있는 자재입니다. 수량은 목록에서 고쳐 주세요.");
      void addLine(exact[0].id, exact[0].name);
      return;
    }
    if (exact.length > 1) return setAddError("같은 이름의 자재가 여러 개입니다. 목록에서 골라 주세요.");
    setListOpen(false);
    setWarnFor(text); // 재고 목록에 없는 자재: 경고하고 등록 여부를 묻는다
  }

  async function handleSave() {
    if (!selected) return;
    const qty = Number(draftQty);
    if (!(qty > 0)) return setPanelError("필요 수량을 1 이상으로 입력해 주세요.");
    setPanelBusy(true);
    setPanelError(null);
    try {
      logDebug("ProjectBom", `BOM 수정 시도: line_id=${selected.id}, qty=${qty}`);
      await apiPut<BomLine>(`/api/projects/${projectId}/bom/${selected.id}`, { quantity: qty, note: draftNote.trim() || null });
      await loadLines();
      dialog.notify("저장했습니다.");
    } catch (err) {
      logError("ProjectBom", "BOM 수정 실패", err);
      setPanelError(err instanceof ApiError ? err.message : "저장하지 못했습니다.");
    } finally {
      setPanelBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!(await dialog.confirm(`'${selected.item_name}' 을(를) BOM에서 뺄까요?`, { okLabel: "삭제", danger: true }))) return;
    try {
      logDebug("ProjectBom", `BOM 삭제 시도: line_id=${selected.id}`);
      await apiDelete(`/api/projects/${projectId}/bom/${selected.id}`);
      setSelectedId(null);
      await loadLines();
    } catch (err) {
      logError("ProjectBom", "BOM 삭제 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  async function handleRegistered(m: MaterialDetail) {
    const target = registerFor?.target;
    setRegisterFor(null);
    await loadMaterials();
    if (target === "new") {
      setPickedId(m.id);
      setQuery(m.name);
      setWarnFor(null);
      await addLine(m.id, m.name);
    } else if (typeof target === "number") {
      try {
        logDebug("ProjectBom", `미등록 줄에 자재 연결: line_id=${target}, material_id=${m.id}`);
        await apiPut<BomLine>(`/api/projects/${projectId}/bom/${target}`, { material_id: m.id });
        await loadLines();
        dialog.notify(`자재관리에 등록하고 연결했습니다 (${m.code}). 재고는 0개입니다.`);
      } catch (err) {
        logError("ProjectBom", "자재 연결 실패", err);
        dialog.notifyError(err instanceof ApiError ? err.message : "연결하지 못했습니다.");
      }
    }
  }

  function renderRow(l: BomLine) {
    const st = bomState(l);
    const on = selectedId === l.id;
    return (
      <div
        key={l.id}
        role="button"
        tabIndex={0}
        aria-pressed={on}
        onClick={() => setSelectedId(on ? null : l.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedId(on ? null : l.id);
          }
        }}
        className={`${ROW_GRID} py-3 border-t border-border cursor-pointer text-center ${on ? "bg-tile-blue" : "hover:bg-bg"}`}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-mono text-text-muted">{l.code ? <CodeText code={l.code} small /> : "코드 없음"}</p>
          <p className="font-semibold break-words">{l.item_name}</p>
        </div>
        <p className="font-bold tabular-nums">{fmt(l.quantity)}개</p>
        <p className="tabular-nums text-text-muted">{l.current_qty === null ? "-" : `${fmt(l.current_qty)}개`}</p>
        <p>
          <span className={`inline-block px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${STATE_BADGE[st]}`}>{bomStateLabel(l)}</span>
        </p>
      </div>
    );
  }

  const groupLabel = (label: string, n: number) => (
    <div className="flex justify-between px-5 py-2 text-xs font-bold text-text-muted bg-bg border-t border-border">
      <span>{label}</span>
      <span>{n}종</span>
    </div>
  );

  return (
    <div className="bg-surface border border-border rounded-2xl mb-6" aria-label="BOM 등록">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-base font-semibold">BOM 등록</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 pb-4">
        {BOM_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-xl border px-4 py-2.5 text-center ${filter === f.key ? "border-primary bg-tile-blue" : "border-border hover:bg-bg"}`}
          >
            <span className="block text-xs text-text-muted">{f.label}</span>
            <strong className={`block text-xl tabular-nums ${TILE_TEXT[f.key]}`}>{counts[f.key]}</strong>
          </button>
        ))}
      </div>

      {error && <p className="px-5 pb-3 text-sm text-danger">{error}</p>}

      <div className={selected ? "grid lg:grid-cols-[minmax(0,1fr)_300px]" : ""}>
        <div className="min-w-0">
          <div className={`${ROW_GRID} py-2.5 border-t border-border text-xs text-text-muted text-center`}>
            <span>자재</span>
            <span>필요 수량</span>
            <span>현재 재고</span>
            <span>상태</span>
          </div>
          {lines === null && !error && <p className="py-8 text-center text-sm text-text-muted border-t border-border">불러오는 중...</p>}
          {lines !== null && lines.length === 0 && (
            <p className="py-8 text-center text-sm text-text-muted border-t border-border">아직 등록된 BOM이 없습니다. 아래에서 자재를 검색해 추가해 주세요.</p>
          )}
          {lines !== null && lines.length > 0 && groups.need.length + groups.ok.length === 0 && (
            <p className="py-8 text-center text-sm text-text-muted border-t border-border">해당하는 자재가 없습니다.</p>
          )}
          {groups.need.length > 0 && groupLabel("조치 필요", groups.need.length)}
          {groups.need.map(renderRow)}
          {groups.ok.length > 0 && groupLabel("재고 충분", groups.ok.length)}
          {groups.ok.map(renderRow)}
        </div>

        {selected && (
          <aside aria-label="BOM 줄 편집" className="border-t lg:border-t-0 lg:border-l border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold break-words">{selected.item_name}</h3>
            <dl className="text-xs text-text-muted space-y-1">
              <div className="flex justify-between gap-2">
                <dt>품목 코드</dt>
                <dd className="font-medium text-text">{selected.code ?? "미등록"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>분류</dt>
                <dd className="font-medium text-text text-right break-words">{selected.registered ? levelPath(selected.sub_levels) || "-" : "자재관리에 없음"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>현재 재고</dt>
                <dd className="font-medium text-text">{selected.current_qty === null ? "-" : `${fmt(selected.current_qty)}개`}</dd>
              </div>
            </dl>
            {selected.shortage !== null && <p className={`px-3 py-2 text-xs font-semibold ${SOFT_BADGE.red}`}>재고가 {fmt(selected.shortage)}개 모자랍니다.</p>}
            <div>
              <label htmlFor="bom-edit-qty" className="block text-xs text-text-muted mb-1">
                필요 수량
              </label>
              <input id="bom-edit-qty" type="number" min={1} value={draftQty} onChange={(e) => setDraftQty(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="bom-edit-note" className="block text-xs text-text-muted mb-1">
                비고
              </label>
              <input id="bom-edit-note" value={draftNote} maxLength={500} onChange={(e) => setDraftNote(e.target.value)} placeholder="비고 추가" className={inputCls} />
            </div>
            {panelError && <p className="text-xs text-danger">{panelError}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleSave()} disabled={panelBusy} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {panelBusy ? "저장 중..." : "저장"}
              </button>
              {!selected.registered && (
                <button
                  type="button"
                  onClick={() => setRegisterFor({ target: selected.id, name: selected.item_name })}
                  className="rounded-lg border border-tile-orange-fg px-3 py-2 text-sm text-tile-orange-fg hover:bg-tile-orange"
                >
                  자재관리에 등록
                </button>
              )}
              <button type="button" onClick={() => void handleDelete()} className="rounded-lg border border-border px-3 py-2 text-sm text-danger hover:bg-bg">
                삭제
              </button>
              <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg">
                닫기
              </button>
            </div>
          </aside>
        )}
      </div>

      <div className="border-t border-border bg-bg rounded-b-2xl px-5 py-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-start">
          <div className="relative flex-1 basis-64 min-w-0">
            <input
              aria-label="자재 검색"
              autoComplete="off"
              placeholder="재고 목록에서 자재 검색 (코드·품명·분류)"
              value={picked ? picked.name : query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPickedId(null);
                setWarnFor(null);
                setListOpen(true);
              }}
              onFocus={() => !picked && setListOpen(true)}
              onBlur={() => window.setTimeout(() => setListOpen(false), 150)}
              className={inputCls}
            />
            {listOpen && !picked && (
              <div role="listbox" className="absolute left-0 right-0 top-full mt-1 z-20 max-h-64 overflow-auto rounded-xl border border-border bg-surface shadow-lg">
                {matches.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs text-text-muted">일치하는 자재가 없습니다. 이름을 그대로 두고 [추가]를 누르면 등록 여부를 물어봅니다.</p>
                ) : (
                  matches.map((m) => {
                    const used = usedMaterialIds.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        disabled={used}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setPickedId(m.id);
                          setQuery(m.name);
                          setListOpen(false);
                          setAddError(null);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm border-b border-border last:border-0 hover:bg-tile-blue disabled:opacity-50 disabled:hover:bg-transparent"
                      >
                        <span className="min-w-0 flex-1">
                          <b className="block break-words">{m.name}</b>
                          <small className="block text-xs text-text-muted">
                            {m.code} · {levelPath(m.sub_levels) || "-"}
                          </small>
                        </span>
                        <span className="text-xs text-text-muted whitespace-nowrap">{used ? "BOM에 있음" : `재고 ${fmt(m.current_qty)}`}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
          <input aria-label="필요 수량" type="number" min={1} placeholder="필요 수량" value={addQty} onChange={(e) => setAddQty(e.target.value)} className={`${inputCls} !w-28 text-right`} />
          <input aria-label="비고" placeholder="비고 (선택)" maxLength={500} value={addNote} onChange={(e) => setAddNote(e.target.value)} className={`${inputCls} !w-auto flex-1 basis-40`} />
          <button type="button" onClick={handleAdd} disabled={adding} className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            추가
          </button>
        </div>

        {picked && (
          <p className="text-xs text-text-muted">
            <CodeText code={picked.code} small /> · {levelPath(picked.sub_levels) || "-"} · 현재 재고 {fmt(picked.current_qty)}개{" "}
            <button type="button" onClick={() => { setPickedId(null); setQuery(""); setListOpen(true); }} className="ml-1 rounded border border-border px-2 py-0.5 hover:bg-surface">
              다시 고르기
            </button>
          </p>
        )}
        {addError && <p className="text-sm text-danger">{addError}</p>}

        {warnFor && (
          <div role="alert" className="rounded-xl border border-tile-orange-fg bg-tile-orange px-4 py-3 text-sm space-y-2">
            <p>
              <b className="text-tile-orange-fg">재고 목록에 없는 자재입니다.</b> ‘{warnFor}’ 은(는) 자재관리에 등록되어 있지 않습니다. 등록하면 재고와 입출고를 함께 관리할 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setRegisterFor({ target: "new", name: warnFor })} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white">
                자재관리에 등록하고 추가
              </button>
              <button type="button" onClick={() => void addLine(null, warnFor)} disabled={adding} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-bg">
                미등록으로 그대로 추가
              </button>
              <button type="button" onClick={() => setWarnFor(null)} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-bg">
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {registerFor && <BomRegisterModal initialName={registerFor.name} onClose={() => setRegisterFor(null)} onRegistered={(m) => void handleRegistered(m)} />}
    </div>
  );
}
