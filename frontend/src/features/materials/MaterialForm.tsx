import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { NumberInput } from "../../components/ui/NumberInput";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { SubLevelEditor } from "./SubLevelTree";
import { CATEGORY_BADGE, CATEGORY_COLOR, CATEGORY_LABELS, CATEGORY_ORDER, formatQty, levelPath, type MaterialCategory, type MaterialDetail, type MaterialInput } from "./types";

const inputCls = "rounded-lg border border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary bg-bg";

/**
 * 자재 등록/수정 입력 폼 (PC·모바일 공용, 시안 A+B): 항목은 밑줄 탭, 이름은 큰 글씨, 속성은 한 줄 경로, 맨 아래에 목록에 보일 모습을 한 줄로 미리 보여 준다.
 *: 항목(필수) → 이름(필수) → 속성(선택, 한 줄 경로) → (등록할 때) 처음 입고. 개수는 입출고 기록으로만 바뀐다.
 * @param basePath 저장하면 이동할 상세 화면의 앞 경로 ("/materials" 또는 "/m/materials")
 */
export function MaterialForm({ basePath }: { basePath: string }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const isEdit = editingId !== null;

  const [category, setCategory] = useState<MaterialCategory>("ic");
  const [name, setName] = useState("");
  const [levels, setLevels] = useState<string[]>(["", "", ""]);
  const [memo, setMemo] = useState("");
  const [showMemo, setShowMemo] = useState(false);
  const [inDate, setInDate] = useState(todayISO());
  const [inQty, setInQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingId === null) return;
    logDebug("MaterialForm", `수정할 자재 불러오기: id=${editingId}`);
    apiGet<MaterialDetail>(`/api/materials/${editingId}`)
      .then((m) => {
        setCategory(m.category);
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const qty = Number(inQty) || 0;
    const body: MaterialInput = {
      category,
      name: name.trim(),
      sub_levels: levels.map((v) => v.trim()).filter(Boolean), // 비워 둔 칸은 건너뛴다
      memo: memo.trim() || null,
      ...(!isEdit && qty > 0 ? { initial_in: { movement_date: inDate, quantity: qty } } : {}),
    };
    setBusy(true);
    try {
      logDebug("MaterialForm", `${isEdit ? "수정" : "등록"} 저장 시도: category=${category}, name=${body.name}, levels=${body.sub_levels.length}`);
      const saved = isEdit ? await apiPut<MaterialDetail>(`/api/materials/${editingId}`, body) : await apiPost<MaterialDetail>("/api/materials", body);
      navigate(`${basePath}/${saved.id}`, { replace: true });
    } catch (err) {
      logError("MaterialForm", "저장 실패", err);
      setError(err instanceof ApiError ? err.message : "저장 중 오류가 발생했습니다.");
      setBusy(false);
    }
  }

  const qty = Number(inQty) || 0;
  const cleanLevels = levels.map((v) => v.trim()).filter(Boolean);
  const accent = CATEGORY_COLOR[category];

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-5 sm:p-8 max-w-xl">
      <div className="flex flex-wrap gap-x-5 border-b border-border mb-6" role="radiogroup" aria-label="항목">
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
            style={category === c ? { borderColor: CATEGORY_COLOR[c] } : undefined}
            className={`pb-2.5 -mb-px border-b-2 text-sm ${category === c ? "font-semibold text-text" : "border-transparent text-text-muted hover:text-text"}`}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <input
        id="material-name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={200}
        aria-label="이름"
        placeholder="자재 이름"
        style={{ caretColor: accent }}
        className="w-full bg-transparent border-0 border-b border-border focus:border-primary outline-none text-2xl font-bold pb-2.5 mb-6 placeholder:text-text-muted/50 placeholder:font-medium"
      />

      <div className="mb-6">
        <p className="text-xs text-text-muted mb-2">
          속성 <span className="opacity-70">· 비워도 됩니다</span>
        </p>
        <SubLevelEditor levels={levels} onChange={setLevels} />
      </div>

      {!isEdit && (
        <div className="mb-5">
          <p className="text-xs text-text-muted mb-2">
            처음 입고 <span className="opacity-70">· 개수를 비워 두면 기록하지 않습니다</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" aria-label="입고 날짜" value={inDate} onChange={(e) => setInDate(e.target.value)} className={`${inputCls} w-40`} />
            <NumberInput id="material-in-qty" aria-label="입고 개수" value={inQty} onChange={setInQty} placeholder="0" className={`${inputCls} w-28 text-right`} />
            <span className="text-sm text-text-muted">개</span>
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
        <p className="text-[11px] text-text-muted mb-1">목록에 이렇게 보입니다</p>
        <p className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`px-2 py-0.5 text-xs font-semibold ${CATEGORY_BADGE[category]}`}>{CATEGORY_LABELS[category]}</span>
          <b className="break-all">{name.trim() || "이름"}</b>
          {cleanLevels.length > 0 && <span className="text-text-muted">— {levelPath(cleanLevels)}</span>}
          {!isEdit && qty > 0 && <span className="text-text-muted">· {formatQty(qty)}개</span>}
        </p>
      </div>

      {error && <p className="text-xs text-danger mb-3">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-7 py-3 disabled:opacity-60">
          {busy ? "저장 중..." : isEdit ? "저장" : "등록"}
        </button>
        <button type="button" onClick={() => navigate(-1)} className="rounded-xl border border-border text-sm text-text-muted px-6 py-3 hover:bg-bg">
          취소
        </button>
      </div>
    </form>
  );
}
