import { AlertCircle, PackageMinus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { CodeText } from "../materials/CodeText";
import { classLabel, levelPath, matchKeyword, type Material, type MaterialDetail } from "../materials/types";
import { BOM_FILTERS, bomCounts, bomPendingRows, bomReleaseRows, bomReleaseTotals, bomState, bomStateLabel, groupBom, type BomFilter, type BomLine, type BomState } from "./bom";
import { BomRegisterModal } from "./BomRegisterModal";
import { useGerbers } from "./ProjectGerberCard";
import { useProjectFiles } from "./useProjectFiles";
import { VersionListModal, type VersionSource } from "./VersionListModal";

type TopKey = "bom" | "gerber" | "viewer" | "pnp" | "kicad" | "step";
const TOP_BUTTONS: { key: TopKey; label: string }[] = [
  { key: "bom", label: "BOM" },
  { key: "gerber", label: "Gerber" },
  { key: "viewer", label: "Gerber Viewer" },
  { key: "pnp", label: "P&P" },
  { key: "kicad", label: "KiCad" },
  { key: "step", label: "STEP" },
];
/** 윗줄 버튼은 모두 같은 크기 (Gerber Viewer 는 글자를 줄여 두 줄로) */
const TOP_BTN_BASE = "inline-flex h-11 w-28 items-center justify-center px-2 text-center text-sm font-medium text-white transition-colors disabled:opacity-60";
const TOP_BTN = `${TOP_BTN_BASE} rounded-xl border-2 border-[#5a6ea3] bg-[#6a7eb3] hover:bg-[#5a6ea3]`;
/** 출고 버튼: 다른 화면의 [등록] 버튼과 같은 파랑 */
const RELEASE_BTN = `${TOP_BTN_BASE} rounded-lg bg-primary hover:bg-primary-hover`;

const STATE_BADGE: Record<BomState, string> = { bad: SOFT_BADGE.red, warn: SOFT_BADGE.orange, good: SOFT_BADGE.green };
/** 상태 막대와 필터 점의 색 */
const DOT: Record<BomFilter, string> = { all: "bg-text-muted/50", bad: "bg-danger", warn: "bg-tile-orange-fg", good: "bg-success" };
const fieldCls =
  "w-full h-[42px] rounded-lg border-[1.5px] border-[color-mix(in_srgb,var(--color-text)_26%,var(--color-surface))] bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20";
const ROW_GRID = "grid grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-3 px-5";
const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg";
const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 프로젝트(=제품 생산)의 "BOM 등록" 카드: 이 프로젝트에 필요한 자재와 수량.
 * 평소에는 왼쪽의 [BOM 등록] 버튼만 보이고, BOM 이 하나라도 있으면 오른쪽에 요약(총 N종 · 재고 부족 · 미등록)이 붙는다. 버튼을 누르면 같은 자리에서 펼쳐진다.
 * 펼치면 "조치가 필요한 자재 N종"과 상태 막대·필터가 먼저 보이고, 부족·미등록은 "조치 필요" 묶음으로 맨 위에 모인다.
 * BOM 이 비어 있으면 안내와 [+ 자재 추가] 버튼만 보이고, 그 버튼을 눌러야 자재 추가 칸이 나타난다.
 * 줄을 누르면 오른쪽 패널에서 수량·비고를 고치거나 지운다. 자재관리(재고 목록)에 없는 자재는 경고와 함께 등록할 수 있다.
 * BOM 수량은 "제품 1개당" 필요한 개수다. [BOM 등록] 옆 [출고] 버튼을 누르면 아래에 출고 패널이 펼쳐지고, 만들 제품 개수를 넣으면
 * 자재별 필요 개수(1개당 × 제품 수)·재고가 요약표로 보인다. 확인한 뒤 [출고 진행]을 누르면 자재관리에 "생산 불출" 출고 기록(메모에 제품 개수)이 남고 재고가 줄어든다.
 * 재고가 모자란 자재는 경고와 함께 이번 출고에서 빠지고(부분 출고는 없다) "보류"로 남는다. 재고를 채운 뒤 패널 아래 [보류분 출고]로 따로 출고한다.
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
  const gerbers = useGerbers(projectId);
  const [popup, setPopup] = useState<TopKey | null>(null); // 버전 목록 팝업
  const bomFiles = useProjectFiles(projectId, "bom", popup === "bom");
  const pnpFiles = useProjectFiles(projectId, "pnp", popup === "pnp");
  const kicadFiles = useProjectFiles(projectId, "kicad", popup === "kicad");
  const stepFiles = useProjectFiles(projectId, "step", popup === "step");
  function openGerberViewer() {
    logDebug("ProjectBom", `Gerber Viewer 새 창 열기: project_id=${projectId}`);
    window.open(`/gerber-viewer/${projectId}`, "_blank", "width=1200,height=820");
  }
  const [releaseOpen, setReleaseOpen] = useState(false); // [출고] 패널
  const [units, setUnits] = useState("1"); // 출고할 제품 개수 (글)
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

  const unitsNum = Number(units);
  const unitsValid = Number.isInteger(unitsNum) && unitsNum >= 1 && unitsNum <= 100000;
  const releaseRows = useMemo(() => bomReleaseRows(lines ?? [], unitsValid ? unitsNum : 0), [lines, unitsNum, unitsValid]);
  const releaseTotals = bomReleaseTotals(releaseRows);
  const pendingRows = useMemo(() => bomPendingRows(lines ?? []), [lines]);
  const canRelease = (lines ?? []).some((l) => l.registered);

  function toggleReleaseOpen() {
    setReleaseOpen((v) => !v);
    setReleaseError(null);
  }

  async function handleRelease() {
    if (!unitsValid) return setReleaseError("출고할 제품 수량을 1 이상의 정수로 입력해 주세요.");
    const lineIds = releaseRows.filter((r) => r.ok).map((r) => r.line.id);
    const heldIds = releaseRows.filter((r) => r.held).map((r) => r.line.id);
    if (lineIds.length === 0) return setReleaseError("재고가 충분한 자재가 없어 출고할 수 없습니다. 입고 후 다시 시도해 주세요.");
    const heldNote = heldIds.length > 0 ? `\n재고가 모자란 ${heldIds.length}종은 이번 출고에서 빠지고 보류분으로 남습니다.` : "";
    if (!(await dialog.confirm(`제품 ${fmt(unitsNum)}개분, ${releaseTotals.kinds}종 ${fmt(releaseTotals.qty)}개를 출고합니다.${heldNote}\n진행할까요?`, { okLabel: "출고 진행" }))) return;
    setReleasing(true);
    setReleaseError(null);
    try {
      logDebug("ProjectBom", `BOM 출고 시도: project_id=${projectId}, units=${unitsNum}, lines=${lineIds.length}, held=${heldIds.length}`);
      const updated = await apiPost<BomLine[]>(`/api/projects/${projectId}/bom/release`, { units: unitsNum, line_ids: lineIds, skipped_line_ids: heldIds });
      logDebug("ProjectBom", `BOM 출고 성공: ${lineIds.length}건`);
      setLines(updated);
      void loadMaterials(); // 재고가 바뀌었으니 자재 추가 칸의 재고도 맞춘다
      dialog.notify(`제품 ${fmt(unitsNum)}개분, ${lineIds.length}종을 출고했습니다.${heldIds.length > 0 ? ` 재고가 모자란 ${heldIds.length}종은 보류분으로 남겼습니다.` : ""}`);
    } catch (err) {
      logError("ProjectBom", "BOM 출고 실패", err);
      setReleaseError(err instanceof ApiError ? err.message : "출고하지 못했습니다.");
      void loadLines();
    } finally {
      setReleasing(false);
    }
  }

  async function handleReleasePending() {
    const ready = pendingRows.filter((r) => r.ready);
    if (ready.length === 0) return setReleaseError("재고가 채워진 보류분이 아직 없습니다.");
    if (!(await dialog.confirm(`보류해 둔 ${ready.length}종(${fmt(ready.reduce((sum, r) => sum + r.need, 0))}개)을 출고합니다. 진행할까요?`, { okLabel: "보류분 출고" }))) return;
    setReleasing(true);
    setReleaseError(null);
    try {
      logDebug("ProjectBom", `BOM 보류분 출고 시도: project_id=${projectId}, lines=${ready.length}`);
      const updated = await apiPost<BomLine[]>(`/api/projects/${projectId}/bom/release-pending`, { line_ids: ready.map((r) => r.line.id) });
      logDebug("ProjectBom", `BOM 보류분 출고 성공: ${ready.length}건`);
      setLines(updated);
      void loadMaterials();
      dialog.notify(`보류분 ${ready.length}종을 출고했습니다. 자재관리에 출고 기록이 남았습니다.`);
    } catch (err) {
      logError("ProjectBom", "BOM 보류분 출고 실패", err);
      setReleaseError(err instanceof ApiError ? err.message : "보류분을 출고하지 못했습니다.");
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
        <div className="min-w-0 text-left">
          <p className="font-semibold break-words">{l.item_name}</p>
          <p className="text-[11px] text-text-muted break-words">
            {l.code ? <CodeText code={l.code} small /> : "코드 없음"}
            {[l.category_label, levelPath(l.sub_levels)].filter(Boolean).map((t) => ` · ${t}`)}
          </p>
        </div>
        <p className="font-bold tabular-nums">{fmt(l.quantity)}개</p>
        <p className="tabular-nums text-text-muted">
          {l.released > 0 ? `${fmt(l.released)}개` : "-"}
          {l.pending_units > 0 && <span className="block text-[11px] font-semibold text-tile-orange-fg">보류 제품 {fmt(l.pending_units)}개분</span>}
        </p>
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
        {TOP_BUTTONS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => (b.key === "viewer" ? openGerberViewer() : setPopup(b.key))}
            className={TOP_BTN}
          >
            {b.key === "viewer" ? (
              <span className="leading-tight">
                Gerber
                <br />
                Viewer
              </span>
            ) : (
              b.label
            )}
          </button>
        ))}
        {lines !== null && lines.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 text-xs" aria-label="BOM 요약">
            <span className="rounded-full bg-bg px-2.5 py-1 font-medium text-text-muted">총 {lines.length}종</span>
            {counts.bad > 0 && <span className={`px-2.5 py-1 font-semibold ${SOFT_BADGE.red}`}>재고 부족 {counts.bad}</span>}
            {counts.warn > 0 && <span className={`px-2.5 py-1 font-semibold ${SOFT_BADGE.orange}`}>미등록 {counts.warn}</span>}
            {counts.bad === 0 && counts.warn === 0 && <span className={`px-2.5 py-1 font-semibold ${SOFT_BADGE.green}`}>모두 충분</span>}
          </div>
        )}
        <button
          type="button"
          aria-expanded={releaseOpen}
          aria-controls="bom-release"
          onClick={toggleReleaseOpen}
          disabled={!canRelease}
          title={canRelease ? undefined : "자재관리에 등록된 자재가 BOM에 있어야 출고할 수 있습니다"}
          className={`${RELEASE_BTN} ml-auto gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${releaseOpen ? "ring-2 ring-primary/40" : ""}`}
        >
          <PackageMinus size={16} aria-hidden />
          출고
          {pendingRows.length > 0 && <span className="rounded-full bg-tile-orange px-1.5 text-[11px] font-bold text-tile-orange-fg">보류 {pendingRows.length}</span>}
        </button>
      </div>

      {error && <p className="px-5 pb-3 text-sm text-danger">{error}</p>}

      {popup === "bom" && (
        <VersionListModal
          title="BOM"
          source={bomFiles}
          onClose={() => setPopup(null)}
          extra={
            <button
              type="button"
              onClick={() => {
                setPopup(null);
                setOpen(true);
              }}
              className="self-start rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium hover:bg-border/40"
            >
              BOM 표(자재 줄) 열기
            </button>
          }
        />
      )}
      {popup === "gerber" && <VersionListModal title="Gerber" source={gerbers as unknown as VersionSource} accept=".zip,.gbr,.gtl,.gbl,.gts,.gbs,.gto,.gbo,.gm1,.drl,.xln,.txt" onClose={() => setPopup(null)} />}
      {popup === "pnp" && <VersionListModal title="P&P" source={pnpFiles} onClose={() => setPopup(null)} />}
      {popup === "kicad" && <VersionListModal title="KiCad" source={kicadFiles} onClose={() => setPopup(null)} />}
      {popup === "step" && <VersionListModal title="STEP" source={stepFiles} onClose={() => setPopup(null)} />}

      {releaseOpen && lines !== null && (
        <div id="bom-release" className="border-t border-border bg-bg px-5 py-4 space-y-3" aria-label="BOM 출고">
          <h3 className="text-sm font-bold">BOM 출고</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="bom-release-units" className="font-semibold">
              출고할 제품 수량
            </label>
            <input
              id="bom-release-units"
              type="number"
              min={1}
              max={100000}
              value={units}
              onChange={(e) => {
                setUnits(e.target.value);
                setReleaseError(null);
              }}
              className={`${inputCls} !w-28 text-right text-base font-bold`}
            />
            개 <span className="text-xs text-text-muted">필요 자재 = BOM의 제품 1개당 수량 × 제품 수량</span>
          </div>

          {unitsValid ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="text-xs text-text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 px-3 font-medium text-left">자재</th>
                      <th className="py-2 px-3 font-medium">1개당</th>
                      <th className="py-2 px-3 font-medium whitespace-nowrap">총 필요 (×{fmt(unitsNum)})</th>
                      <th className="py-2 px-3 font-medium">현재 재고</th>
                      <th className="py-2 px-3 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releaseRows.map((r) => (
                      <tr key={r.line.id} className={`border-b border-border last:border-0 text-center ${r.ok ? "" : "opacity-70"}`}>
                        <td className="py-2 px-3 text-left">
                          <p className="font-semibold break-words">{r.line.item_name}</p>
                          <p className="text-[11px] text-text-muted break-words">
                            {r.line.code ?? "코드 없음"}
                            {[r.line.category_label, levelPath(r.line.sub_levels)].filter(Boolean).map((t) => ` · ${t}`)}
                          </p>
                        </td>
                        <td className="py-2 px-3 tabular-nums">{fmt(r.line.quantity)}</td>
                        <td className="py-2 px-3 tabular-nums font-bold">{fmt(r.need)}</td>
                        <td className="py-2 px-3 tabular-nums">{r.line.current_qty === null ? "-" : fmt(r.line.current_qty)}</td>
                        <td className="py-2 px-3">
                          {!r.line.registered ? (
                            <span className={`inline-block px-2.5 py-1 text-xs font-semibold ${SOFT_BADGE.orange}`}>미등록 · 출고 불가</span>
                          ) : r.held ? (
                            <span className={`inline-block px-2.5 py-1 text-xs font-semibold ${SOFT_BADGE.red}`}>{fmt(r.short)}개 부족 · 이번 출고 제외</span>
                          ) : (
                            <span className={`inline-block px-2.5 py-1 text-xs font-semibold ${SOFT_BADGE.green}`}>출고</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-surface font-bold text-center">
                      <td colSpan={2} className="py-2 px-3 text-left">
                        출고 합계 (제품 {fmt(unitsNum)}개분)
                      </td>
                      <td className="py-2 px-3 tabular-nums">{fmt(releaseTotals.qty)}개</td>
                      <td colSpan={2} className="py-2 px-3">
                        {releaseTotals.kinds}종
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {releaseTotals.held > 0 && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-tile-orange px-3 py-2 text-sm text-tile-orange-fg">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    <b>재고가 모자란 {releaseTotals.held}종은 이번 출고에서 빠집니다.</b> [출고 진행]을 누르면 "보류"로 남고, 입고해서 재고를 채운 뒤 아래 [보류분 출고]에서 따로 출고할 수 있습니다.
                  </span>
                </p>
              )}
              {releaseTotals.held === 0 && releaseTotals.kinds > 0 && <p className="rounded-lg bg-tile-blue px-3 py-2 text-sm text-tile-blue-fg">모든 자재의 재고가 충분합니다.</p>}
            </>
          ) : (
            <p className="text-sm text-text-muted">출고할 제품 수량을 1 이상의 정수로 입력하면 요약이 나타납니다.</p>
          )}

          {releaseError && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-tile-red px-3 py-2 text-sm font-medium text-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
              {releaseError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleRelease()}
              disabled={releasing || !unitsValid || releaseTotals.kinds === 0}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {releasing ? "출고 중..." : "출고 진행"}
            </button>
            <button type="button" onClick={() => setReleaseOpen(false)} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-bg">
              닫기
            </button>
          </div>

          {pendingRows.length > 0 && (
            <div className="mt-2 space-y-2 border-t border-border pt-3" aria-label="보류분 출고">
              <h4 className="text-sm font-bold">보류된 출고 ({pendingRows.length}종)</h4>
              <p className="text-xs text-text-muted">이전 출고에서 재고가 모자라 빠진 자재입니다. 입고로 재고가 채워지면 보류된 제품 개수만큼 따로 출고합니다.</p>
              <ul className="space-y-1.5 text-sm">
                {pendingRows.map((r) => (
                  <li key={r.line.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="min-w-40 flex-1 font-semibold break-words">{r.line.item_name}</span>
                    <span className="text-xs text-text-muted">
                      제품 {fmt(r.line.pending_units)}개분 · 필요 {fmt(r.need)}개 · 재고 {fmt(r.line.current_qty ?? 0)}개
                    </span>
                    {r.ready ? (
                      <span className={`px-2.5 py-1 text-xs font-semibold ${SOFT_BADGE.green}`}>출고 가능</span>
                    ) : (
                      <span className={`px-2.5 py-1 text-xs font-semibold ${SOFT_BADGE.red}`}>{fmt(r.short)}개 부족</span>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void handleReleasePending()}
                disabled={releasing || !pendingRows.some((r) => r.ready)}
                className="rounded-lg border border-primary px-4 py-2 text-sm font-bold text-primary hover:bg-tile-blue disabled:opacity-50"
              >
                보류분 출고 ({pendingRows.filter((r) => r.ready).length}종)
              </button>
            </div>
          )}
        </div>
      )}

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

      <div className={selected ? "grid lg:grid-cols-[minmax(0,1fr)_300px]" : ""}>
        <div className="min-w-0">
          {hasLines && (
            <div className={`${ROW_GRID} py-2.5 border-t border-border text-xs text-text-muted text-center`}>
              <span>자재</span>
              <span>제품 1개당</span>
              <span>출고됨(누계)</span>
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
                제품 1개당 수량
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
          <input aria-label="제품 1개당 수량" type="number" min={1} placeholder="제품 1개당 수량" value={addQty} onChange={(e) => setAddQty(e.target.value)} className={`${fieldCls} !w-28 text-right`} />
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
