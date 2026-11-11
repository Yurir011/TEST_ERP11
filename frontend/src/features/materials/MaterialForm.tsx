import { useContext, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DialogContext } from "../../components/ui/dialog/useDialog";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { PrefixBadge, prefixFor } from "./CodeText";
import { QtyInput, emptyQty, qtyIncomplete, qtyPayload, qtyReels, qtyTotal, type QtyState } from "./QtyInput";
import { SubLevelEditor } from "./SubLevelTree";
import {
  CATEGORY_CHIPS,
  CATEGORY_LABELS,
  MATERIAL_KIND_LABELS,
  formatReelQty,
  levelPath,
  type MaterialCategory,
  type MaterialDetail,
  type MaterialInput,
  type MaterialKind,
} from "./types";

const inputCls = "rounded-lg border border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary bg-bg";

/**
 * 자재 등록/수정 입력 폼 (PC·모바일 공용, 시안 A-3).
 * 순서: 품목(칩) → 속성(번호 칸, 눌러서 이전 속성 고르기) → 품명 → (등록할 때) 처음 입고(개 / 릴) → 한 줄 미리보기.
 * 품목 칩은 평소 "회로부품" 네 글자만 보이고, 회로부품을 누르면 작은 메뉴가 열려 전용 / 범용을 고른다. 고르기 전에는 등록할 수 없다.
 * @param basePath 저장하면 이동할 상세 화면의 앞 경로 ("/materials" 또는 "/m/materials")
 */
export function MaterialForm({ basePath }: { basePath: string }) {
  const navigate = useNavigate();
  const dialog = useContext(DialogContext); // 안내 창이 없는 곳(테스트 등)에서도 그려지도록 필수로 쓰지 않는다
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const isEdit = editingId !== null;

  const [category, setCategory] = useState<MaterialCategory>("ic");
  const [kind, setKind] = useState<MaterialKind | null>(null);
  const [name, setName] = useState("");
  const [levels, setLevels] = useState<string[]>(["", "", ""]);
  const [history, setHistory] = useState<string[][]>([]);
  const [memo, setMemo] = useState("");
  const [showMemo, setShowMemo] = useState(false);
  const [inDate, setInDate] = useState(todayISO());
  const [inQty, setInQty] = useState<QtyState>(emptyQty());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    logDebug("MaterialForm", "이전 속성 불러오기");
    apiGet<{ levels: string[][] }>("/api/materials/level-history")
      .then((r) => setHistory(r?.levels ?? []))
      .catch((err) => logError("MaterialForm", "이전 속성 불러오기 실패 (입력은 계속 가능)", err));
  }, []);

  useEffect(() => {
    if (editingId === null) return;
    logDebug("MaterialForm", `수정할 자재 불러오기: id=${editingId}`);
    apiGet<MaterialDetail>(`/api/materials/${editingId}`)
      .then((m) => {
        setCategory(m.category);
        setKind(m.kind);
        setName(m.name);
        setLevels(m.sub_levels);
        setMemo(m.memo ?? "");
        setShowMemo(!!m.memo);
      })
      .catch((err) => {
        logError("MaterialForm", "자재 불러오기 실패", err);
        setError(err instanceof ApiError ? err.message : "자재를 불러오지 못했습니다.");
      });
  }, [editingId]);

  const prefix = prefixFor(category, kind);
  const cleanLevels = levels.map((v) => v.trim()).filter(Boolean);
  const total = qtyTotal(inQty);
  const needKind = category === "ic" && kind === null;

  /** 품목 칩 한 개를 누른다. 회로부품은 전용/범용이 칩 하나씩이라 누르면 종류까지 함께 정해진다. */
  function pickChip(c: MaterialCategory, k: MaterialKind | null) {
    setCategory(c);
    setKind(k);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (needKind) return setError("회로부품은 전용 또는 범용을 골라주세요.");
    const qty = qtyPayload(inQty);
    if (!isEdit && qtyIncomplete(inQty)) return setError("릴 구성의 개수와 릴 수를 모두 입력해주세요.");
    const body: MaterialInput = {
      category,
      kind: category === "ic" ? kind : null,
      name: name.trim(),
      sub_levels: cleanLevels, // 비워 둔 칸은 건너뛴다
      memo: memo.trim() || null,
      ...(!isEdit && qty ? { initial_in: { movement_date: inDate, ...qty } } : {}),
    };
    setBusy(true);
    try {
      logDebug("MaterialForm", `${isEdit ? "수정" : "등록"} 저장 시도: category=${category}, kind=${kind}, name=${body.name}, levels=${body.sub_levels.length}, unit=${inQty.unit}`);
      const saved = isEdit ? await apiPut<MaterialDetail>(`/api/materials/${editingId}`, body) : await apiPost<MaterialDetail>("/api/materials", body);
      if (saved.merged) {
        logDebug("MaterialForm", `같은 자재가 있어 추가 입고로 기록: id=${saved.id}, code=${saved.code}`);
        dialog?.notify(`이미 있는 자재(${saved.code})라서 새로 만들지 않고 입고로 기록했습니다.`);
      }
      navigate(`${basePath}/${saved.id}`, { replace: true });
    } catch (err) {
      logError("MaterialForm", "저장 실패", err);
      setError(err instanceof ApiError ? err.message : "저장 중 오류가 발생했습니다.");
      setBusy(false);
    }
  }

  const pathParts = [CATEGORY_LABELS[category], ...(category === "ic" && kind ? [MATERIAL_KIND_LABELS[kind]] : []), ...cleanLevels];

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-5 sm:p-8 max-w-2xl">
      <p className="text-xs text-text-muted mb-2">품목</p>
      <div className="flex flex-wrap gap-1.5 mb-6" role="radiogroup" aria-label="품목">
        {CATEGORY_CHIPS.map((chip) => {
          const on = category === chip.category && kind === chip.kind;
          return (
            <button
              key={chip.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pickChip(chip.category, chip.kind)}
              className={`rounded-full border px-4 py-1.5 text-sm ${on ? "bg-primary border-primary text-white font-semibold" : "border-border bg-bg text-text hover:bg-surface"}`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="mb-6">
        <p className="text-xs text-text-muted mb-2">
          속성 <span className="opacity-70">· 비워도 됩니다</span>
        </p>
        <SubLevelEditor levels={levels} onChange={setLevels} history={history} />
      </div>

      <div className="mb-6">
        <label htmlFor="material-name" className="block text-xs text-text-muted mb-2">
          품명
        </label>
        <input
          id="material-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          placeholder="예: STM32F103C8T6"
          className={`${inputCls} w-full`}
        />
      </div>

      {!isEdit && (
        <div className="mb-5">
          <p className="text-xs text-text-muted mb-2">
            처음 입고 <span className="opacity-70">· 개수를 비워 두면 기록하지 않습니다</span>
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <input type="date" aria-label="입고 날짜" value={inDate} onChange={(e) => setInDate(e.target.value)} className={`${inputCls} w-40`} />
            <QtyInput label="입고" id="material-in-qty" value={inQty} onChange={setInQty} className="min-w-0 flex-1" />
          </div>
        </div>
      )}

      {showMemo ? (
        <textarea aria-label="메모" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" className={`${inputCls} w-full resize-y mb-5`} />
      ) : (
        <button type="button" onClick={() => setShowMemo(true)} className="text-sm text-primary mb-5">
          + 메모 추가
        </button>
      )}

      <div className="rounded-xl bg-bg border border-border px-4 py-3 mb-6" aria-label="미리보기">
        <p className="text-[11px] text-text-muted mb-1">미리보기</p>
        <p className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
          {prefix && <PrefixBadge prefix={prefix} />}
          <span className="text-text-muted" data-testid="preview-path">
            {pathParts.join(" › ") || levelPath(cleanLevels)}
          </span>
          <span className="text-text-muted">·</span>
          <b className="break-all">{name.trim() || "품명"}</b>
          {!isEdit && total > 0 && <span className="text-text-muted">· {formatReelQty(total, inQty.unit === "reel" ? qtyReels(inQty) : null)}</span>}
        </p>
      </div>

      {error && <p className="text-xs text-danger mb-3">{error}</p>}
      {needKind && !error && <p className="text-xs text-text-muted mb-3">회로부품은 전용 / 범용 중 하나를 골라 주세요.</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || needKind}
          className="rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-7 py-3 disabled:opacity-60"
        >
          {busy ? "저장 중..." : isEdit ? "저장" : "등록"}
        </button>
        <button type="button" onClick={() => navigate(-1)} className="rounded-xl border border-border text-sm text-text-muted px-6 py-3 hover:bg-bg">
          취소
        </button>
      </div>
    </form>
  );
}
