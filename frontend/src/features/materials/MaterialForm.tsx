import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { PrefixBadge, prefixFor } from "./CodeText";
import { QtyInput, emptyQty, qtyPayload, qtyTotal, type QtyState } from "./QtyInput";
import { SubLevelEditor } from "./SubLevelTree";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  MATERIAL_KIND_LABELS,
  MATERIAL_KIND_ORDER,
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
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const isEdit = editingId !== null;

  const [category, setCategory] = useState<MaterialCategory>("ic");
  const [kind, setKind] = useState<MaterialKind | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState("");
  const [levels, setLevels] = useState<string[]>(["", "", ""]);
  const [history, setHistory] = useState<string[][]>([]);
  const [memo, setMemo] = useState("");
  const [showMemo, setShowMemo] = useState(false);
  const [inDate, setInDate] = useState(todayISO());
  const [inQty, setInQty] = useState<QtyState>(emptyQty());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLSpanElement>(null);

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

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const prefix = prefixFor(category, kind);
  const cleanLevels = levels.map((v) => v.trim()).filter(Boolean);
  const total = qtyTotal(inQty);
  const needKind = category === "ic" && kind === null;

  function pickCategory(c: MaterialCategory) {
    if (c === "ic") {
      setCategory("ic");
      setMenuOpen((o) => !o);
      return;
    }
    setCategory(c);
    setKind(null);
    setMenuOpen(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (needKind) return setError("회로부품은 전용 또는 범용을 골라주세요.");
    const qty = qtyPayload(inQty);
    if (!isEdit && inQty.unit === "reel" && !qty && (Number(inQty.reels) > 0 || Number(inQty.perReel) > 0)) return setError("릴 수와 1릴 당 개수를 모두 입력해주세요.");
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
        {CATEGORY_ORDER.map((c) => {
          const on = category === c;
          const chip = (
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-haspopup={c === "ic" ? "menu" : undefined}
              aria-expanded={c === "ic" ? menuOpen : undefined}
              onClick={() => pickCategory(c)}
              className={`rounded-full border px-4 py-1.5 text-sm ${on ? "bg-primary border-primary text-white font-semibold" : "border-border bg-bg text-text hover:bg-surface"}`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          );
          if (c !== "ic") return <span key={c}>{chip}</span>;
          return (
            <span key={c} ref={menuRef} className="relative">
              {chip}
              {menuOpen && (
                <div role="menu" aria-label="회로부품 종류" className="absolute left-0 top-full mt-1.5 z-20 min-w-40 rounded-xl border border-border bg-surface shadow-lg p-1">
                  {MATERIAL_KIND_ORDER.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="menuitemradio"
                      aria-checked={kind === k}
                      onClick={() => {
                        setKind(k);
                        setMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-6 rounded-lg px-3 py-2 text-sm text-left hover:bg-bg ${kind === k ? "text-primary font-bold" : ""}`}
                    >
                      {MATERIAL_KIND_LABELS[k]}
                      <small className="font-mono text-[11px] text-text-muted">{k === "dedicated" ? "EC" : "EG"}</small>
                    </button>
                  ))}
                </div>
              )}
            </span>
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
          {!isEdit && total > 0 && <span className="text-text-muted">· {formatReelQty(total, inQty.unit === "reel" ? Number(inQty.reels) : null)}</span>}
        </p>
      </div>

      {error && <p className="text-xs text-danger mb-3">{error}</p>}
      {needKind && !error && <p className="text-xs text-text-muted mb-3">회로부품을 눌러 전용 / 범용을 골라 주세요.</p>}

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
