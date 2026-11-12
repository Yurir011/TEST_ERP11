import { AlertCircle, ChevronDown, List, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { CodeText } from "../materials/CodeText";
import { classLabel, levelPath, matchKeyword, type Material, type MaterialDetail } from "../materials/types";
import { BOM_FILTERS, bomCounts, bomReleasable, bomRemaining, bomState, bomStateLabel, groupBom, type BomFilter, type BomLine, type BomState } from "./bom";
import { BomRegisterModal } from "./BomRegisterModal";

const STATE_BADGE: Record<BomState, string> = { bad: SOFT_BADGE.red, warn: SOFT_BADGE.orange, good: SOFT_BADGE.green };
/** 상태 막대와 필터 점의 색 */
const DOT: Record<BomFilter, string> = { all: "bg-text-muted/50", bad: "bg-danger", warn: "bg-tile-orange-fg", good: "bg-success" };
const fieldCls =
  "w-full h-[42px] rounded-lg border-[1.5px] border-[color-mix(in_srgb,var(--color-text)_26%,var(--color-surface))] bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20";
const ROW_GRID = "grid grid-cols-[20px_minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-3 px-5";
const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg";
const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 프로젝트(=제품 생산)의 "BOM 등록" 카드: 이 프로젝트에 필요한 자재와 수량.
 * 평소에는 왼쪽의 [BOM 등록] 버튼만 보이고, BOM 이 하나라도 있으면 오른쪽에 요약(총 N종 · 재고 부족 · 미등록)이 붙는다. 버튼을 누르면 같은 자리에서 펼쳐진다.
 * 펼치면 "조치가 필요한 자재 N종"과 상태 막대·필터가 먼저 보이고, 부족·미등록은 "조치 필요" 묶음으로 맨 위에 모인다.
 * BOM 이 비어 있으면 안내와 [+ 자재 추가] 버튼만 보이고, 그 버튼을 눌러야 자재 추가 칸이 나타난다.
 * 줄을 누르면 오른쪽 패널에서 수량·비고를 고치거나 지운다. 자재관리(재고 목록)에 없는 자재는 경고와 함께 등록할 수 있다.
 * 줄 앞 체크박스로 고른 뒤 [선택 항목 출고]를 누르면 줄마다 출고 수량을 확인하고 한꺼번에 출고한다 (자재관리에 "생산 불출" 출고 기록이 남고 재고가 줄어든다).
 * 자재관리에 없는 줄·남은 필요 수량이 없는 줄·재고가 모자란 줄은 고를 수 없다.
 */
export function ProjectBomCard({ projectId }: { projectId: number }) {
  const dialog = useDialog();
  const [addOpen, setAddOpen] = useState(false); // BOM 이 비어 있을 때만 쓴다: [+ 자재 추가]를 눌러야 추가 칸이 보인다
  const [open, setOpen] = useState(false); // 평소에는 접어 두고 버튼만 보인다 (열어 둔 상태는 기억하지 않는다)
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
  // 출고: 체크한 줄, 확인 창, 줄마다 출고 수량(글), 처리 중·오류
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseQty, setReleaseQty] = useState<Record<number, string>>({});
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
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
  const issues = counts.bad + counts.warn;
  const hasLines = lines !== null && lines.length > 0;
  const showAdd = hasLines || addOpen;
  const selected = lines?.find((l) => l.id === selectedId) ?? null;
  const usedMaterialIds = useMemo(() => new Set((lines ?? []).flatMap((l) => (l.material_id === null ? [] : [l.material_id]))), [lines]);

  useEffect(() => {
    setDraftQty(selected ? String(selected.quantity) : "");
    setDraftNote(selected?.note ?? "");
    setPanelError(null);
  }, [selected]);

  const releasableIds = useMemo(() => (lines ?? []).filter(bomReleasable).map((l) => l.id), [lines]);
  const checkedLines = (lines ?? []).filter((l) => checked.has(l.id) && bomReleasable(l));

  function toggleChecked(id: number, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    setReleaseOpen(false);
  }

  function openRelease() {
    setReleaseQty(Object.fromEntries(checkedLines.map((l) => [l.id, String(bomRemaining(l))])));
    setReleaseError(null);
    setReleaseOpen(true);
  }

  async function handleRelease() {
    const items = checkedLines.map((l) => ({ line_id: l.id, quantity: Number(releaseQty[l.id]) })).filter((x) => x.quantity > 0);
    if (items.length === 0) return setReleaseError("출고할 수량을 1 이상으로 입력해 주세요.");
    for (const it of items) {
      const l = checkedLines.find((x) => x.id === it.line_id)!;
      if (!Number.isInteger(it.quantity) || it.quantity > bomRemaining(l)) return setReleaseError(`'${l.item_name}' 은(는) 남은 필요 수량(${fmt(bomRemaining(l))}개) 이하의 정수로 입력해 주세요.`);
    }
    setReleasing(true);
    setReleaseError(null);
    try {
      logDebug("ProjectBom", `BOM 출고 시도: project_id=${projectId}, lines=${items.length}`);
      const updated = await apiPost<BomLine[]>(`/api/projects/${projectId}/bom/release`, { items });
      logDebug("ProjectBom", `BOM 출고 성공: ${items.length}건`);
      setLines(updated);
      setChecked(new Set());
      setReleaseOpen(false);
      void loadMaterials(); // 재고가 바뀌었으니 자재 추가 칸의 재고도 맞춘다
      dialog.notify(`${items.length}종을 출고했습니다. 자재관리에 출고 기록이 남았습니다.`);
    } catch (err) {
      logError("ProjectBom", "BOM 출고 실패", err);
      setReleaseError(err instanceof ApiError ? err.message : "출고하지 못했습니다.");
      void loadLines();
    } finally {
      setReleasing(false);
    }
  }

  const matches = useMemo(() => {
    return query.trim() ? materials.filter((m) => matchKeyword(m, query)) : materials;
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
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex">
          <input
            type="checkbox"
            aria-label={`${l.item_name} 출고 선택`}
            disabled={!bomReleasable(l)}
            title={bomReleasable(l) ? undefined : l.registered ? (bomRemaining(l) === 0 ? "이미 모두 출고했습니다" : "재고가 모자라 출고할 수 없습니다") : "자재관리에 등록한 뒤 출고할 수 있습니다"}
            checked={checked.has(l.id)}
            onChange={(e) => toggleChecked(l.id, e.target.checked)}
          />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-mono text-text-muted">{l.code ? <CodeText code={l.code} small /> : "코드 없음"}</p>
          <p className="font-semibold break-words">{l.item_name}</p>
        </div>
        <p className="font-bold tabular-nums">{fmt(l.quantity)}개</p>
        <p className="tabular-nums text-text-muted">{l.released > 0 ? `${fmt(l.released)}개` : "-"}</p>
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
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="bom-content"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition-colors ${open ? "bg-border/50" : "bg-bg hover:bg-border/40"}`}
        >
          <List size={16} className="text-primary" aria-hidden />
          BOM 등록
          <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {lines !== null && lines.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 text-xs" aria-label="BOM 요약">
            <span className="rounded-full bg-bg px-2.5 py-1 font-medium text-text-muted">총 {lines.length}종</span>
            {counts.bad > 0 && <span className={`px-2.5 py-1 font-semibold ${SOFT_BADGE.red}`}>재고 부족 {counts.bad}</span>}
            {counts.warn > 0 && <span className={`px-2.5 py-1 font-semibold ${SOFT_BADGE.orange}`}>미등록 {counts.warn}</span>}
            {counts.bad === 0 && counts.warn === 0 && <span className={`px-2.5 py-1 font-semibold ${SOFT_BADGE.green}`}>모두 충분</span>}
          </div>
        )}
      </div>

      {error && <p className="px-5 pb-3 text-sm text-danger">{error}</p>}

      {open && (
        <div id="bom-content" className="border-t border-border">
      {hasLines && (
        <div className="px-5 pt-4 pb-3 space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-[15px]">{issues > 0 ? `조치가 필요한 자재 ${issues}종` : "모든 자재의 재고가 충분합니다"}</strong>
            <span className="text-xs text-text-muted">{issues > 0 ? `전체 ${counts.all}종 중` : `전체 ${counts.all}종`}</span>
          </div>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-bg" aria-hidden>
            {(["bad", "warn", "good"] as const)
              .filter((k) => counts[k] > 0)
              .map((k) => (
                <i key={k} className={`block h-full min-w-1.5 ${DOT[k]}`} style={{ flex: counts[k] }} />
              ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BOM_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${filter === f.key ? "border-border bg-bg font-bold text-text" : "border-transparent text-text-muted hover:bg-bg"}`}
              >
                <i className={`h-2 w-2 rounded-full ${DOT[f.key]}`} />
                {f.label} <b className="tabular-nums text-text">{counts[f.key]}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasLines && (
        <div className={`flex flex-wrap items-center gap-2 px-5 py-2.5 border-t border-border text-sm ${checkedLines.length > 0 ? "bg-tile-blue" : "bg-bg text-text-muted"}`}>
          {checkedLines.length > 0 ? (
            <>
              <b className="text-tile-blue-fg">{checkedLines.length}개 선택됨</b>
              <span className="flex-1" />
              <button type="button" onClick={() => { setChecked(new Set()); setReleaseOpen(false); }} className="rounded-lg border border-border bg-surface px-3 py-1.5 hover:bg-bg">
                선택 해제
              </button>
              <button type="button" onClick={openRelease} className="rounded-lg bg-primary px-4 py-1.5 font-bold text-white hover:bg-primary-hover">
                선택 항목 출고
              </button>
            </>
          ) : (
            <span>출고할 줄을 체크하세요. (재고가 충분하고 아직 출고하지 않은 자재만 고를 수 있습니다)</span>
          )}
        </div>
      )}

      {releaseOpen && checkedLines.length > 0 && (
        <div className="px-5 py-4 border-t border-border bg-bg space-y-2.5" aria-label="출고 확인">
          <h3 className="text-sm font-bold">선택한 {checkedLines.length}종 출고 확인</h3>
          {checkedLines.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="min-w-40 flex-1 font-semibold break-words">{l.item_name}</span>
              <span className="text-xs text-text-muted">남은 필요 {fmt(bomRemaining(l))} · 재고 {fmt(l.current_qty ?? 0)}</span>
              <input
                aria-label={`${l.item_name} 출고 수량`}
                type="number"
                min={1}
                max={bomRemaining(l)}
                value={releaseQty[l.id] ?? ""}
                onChange={(e) => setReleaseQty((prev) => ({ ...prev, [l.id]: e.target.value }))}
                className={`${inputCls} !w-28 text-right`}
              />
              개
            </div>
          ))}
          <p className="text-xs text-text-muted">출고 사유는 "생산 불출"로 기록되고, 자재관리의 입출고 기록에도 남습니다.</p>
          {releaseError && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-tile-red px-3 py-2 text-sm font-medium text-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
              {releaseError}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleRelease()} disabled={releasing} className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">
              {releasing ? "출고 중..." : "출고하기"}
            </button>
            <button type="button" onClick={() => setReleaseOpen(false)} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-bg">
              취소
            </button>
          </div>
        </div>
      )}

      <div className={selected ? "grid lg:grid-cols-[minmax(0,1fr)_300px]" : ""}>
        <div className="min-w-0">
          {hasLines && (
            <div className={`${ROW_GRID} py-2.5 border-t border-border text-xs text-text-muted text-center`}>
              <input
                type="checkbox"
                aria-label="출고할 수 있는 줄 전체 선택"
                disabled={releasableIds.length === 0}
                checked={releasableIds.length > 0 && releasableIds.every((id) => checked.has(id))}
                ref={(el) => {
                  if (el) el.indeterminate = checked.size > 0 && !releasableIds.every((id) => checked.has(id));
                }}
                onChange={(e) => {
                  setChecked(e.target.checked ? new Set(releasableIds) : new Set());
                  setReleaseOpen(false);
                }}
              />
              <span>자재</span>
              <span>필요 수량</span>
              <span>출고됨</span>
              <span>현재 재고</span>
              <span>상태</span>
            </div>
          )}
          {lines === null && !error && <p className="py-8 text-center text-sm text-text-muted border-t border-border">불러오는 중...</p>}
          {lines !== null && lines.length === 0 && (
            <div className="px-5 py-8 text-center border-t border-border">
              <p className="font-semibold">아직 등록된 BOM이 없습니다</p>
              {addOpen ? (
                <p className="mt-1 text-sm text-text-muted">아래에서 자재를 검색해 이 프로젝트에 필요한 자재를 추가해 주세요.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-tile-blue px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
                >
                  <Plus size={15} /> 자재 추가
                </button>
              )}
            </div>
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

      {showAdd && (
      <div className="px-4 pb-4 pt-1">
      <div className="rounded-2xl border border-primary/30 bg-tile-blue p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-primary">
          <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-white">
            <Plus size={14} />
          </span>
          자재 추가
        </div>
        <div className="flex flex-wrap gap-2.5 items-start">
          <div className="relative flex-1 basis-64 min-w-0">
            <input
              aria-label="자재 검색"
              autoComplete="off"
              placeholder="재고 목록에서 자재 검색 (코드·품명·분류·속성, 100nF = 0.1uF 환산)"
              value={picked ? picked.name : query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPickedId(null);
                setWarnFor(null);
                setListOpen(true);
              }}
              onFocus={() => !picked && setListOpen(true)}
              onBlur={() => window.setTimeout(() => setListOpen(false), 150)}
              className={fieldCls}
            />
            {listOpen && !picked && (
              <div role="listbox" className="absolute left-0 right-0 top-full mt-1 z-20 max-h-[26rem] overflow-auto rounded-xl border border-border bg-surface shadow-lg">
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
                          <small className="block text-xs text-text-muted break-words">
                            {m.code} · {classLabel(m) || "-"}
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
          <input aria-label="필요 수량" type="number" min={1} placeholder="필요 수량" value={addQty} onChange={(e) => setAddQty(e.target.value)} className={`${fieldCls} !w-28 text-right`} />
          <input aria-label="비고" placeholder="비고 (선택)" maxLength={500} value={addNote} onChange={(e) => setAddNote(e.target.value)} className={`${fieldCls} !w-auto flex-1 basis-40`} />
          <button type="button" onClick={handleAdd} disabled={adding} className="h-[42px] rounded-lg bg-primary px-6 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">
            추가
          </button>
        </div>

        {picked && (
          <p className="text-xs text-text-muted">
            <CodeText code={picked.code} small /> · {classLabel(picked) || "-"} · 현재 재고 {fmt(picked.current_qty)}개{" "}
            <button type="button" onClick={() => { setPickedId(null); setQuery(""); setListOpen(true); }} className="ml-1 rounded border border-border px-2 py-0.5 hover:bg-surface">
              다시 고르기
            </button>
          </p>
        )}
        {addError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-tile-red px-3 py-2 text-sm font-medium text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            {addError}
          </p>
        )}

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
      </div>
      )}

        </div>
      )}

      {registerFor && <BomRegisterModal initialName={registerFor.name} onClose={() => setRegisterFor(null)} onRegistered={(m) => void handleRegistered(m)} />}
    </div>
  );
}
