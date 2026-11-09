import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { NumberInput } from "../../components/ui/NumberInput";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { SubLevelEditor } from "./SubLevelTree";
import { CATEGORY_BADGE, CATEGORY_LABELS, CATEGORY_ORDER, type MaterialCategory, type MaterialDetail, type MaterialInput } from "./types";

const inputCls = "w-full rounded-lg border border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary bg-bg";

/**
 * 자재 등록/수정 입력 폼 (PC·모바일 공용): 항목(필수) → 이름(필수) → 하위 속성(선택, 트리) → (등록할 때) 처음 입고. 개수는 입출고 기록으로만 바뀐다.
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

  const rootLabel = `${CATEGORY_LABELS[category]} · ${name.trim() || "이름"}`;

  return (
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-5 max-w-xl">
        <div>
          <label className="block text-xs text-text-muted mb-1.5">항목 (필수)</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="항목">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={`rounded-lg border px-3 py-2.5 text-sm ${category === c ? "border-primary bg-tile-blue text-tile-blue-fg font-semibold" : "border-border text-text-muted hover:bg-bg"}`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="material-name" className="block text-xs text-text-muted mb-1.5">
            이름 (필수)
          </label>
          <div className="flex items-center gap-2">
            <span className={`shrink-0 px-3 py-2 text-sm font-semibold ${CATEGORY_BADGE[category]}`}>{CATEGORY_LABELS[category]}</span>
            <input id="material-name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="예: STM32F103C8T6" className={inputCls} />
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            목록에는 <b>{CATEGORY_LABELS[category]} · {name.trim() || "이름"}</b> 처럼 항목과 이름이 함께 보입니다.
          </p>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">하위 속성 (선택 · 채운 칸만 저장)</label>
          <SubLevelEditor levels={levels} onChange={setLevels} rootLabel={rootLabel} />
          <p className="text-xs text-text-muted mt-1.5">3단계 칸을 기본으로 보여 주고, 비워 두면 건너뜁니다. 더 필요하면 단계를 추가하세요.</p>
        </div>

        {!isEdit && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="material-in-date" className="block text-xs text-text-muted mb-1.5">
                입고 날짜
              </label>
              <input id="material-in-date" type="date" value={inDate} onChange={(e) => setInDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="material-in-qty" className="block text-xs text-text-muted mb-1.5">
                입고 개수 (없으면 비워 두세요)
              </label>
              <NumberInput id="material-in-qty" value={inQty} onChange={setInQty} placeholder="0" className={inputCls} />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="material-memo" className="block text-xs text-text-muted mb-1.5">
            메모 (선택)
          </label>
          <textarea id="material-memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} className={`${inputCls} resize-y`} />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-6 py-2.5 disabled:opacity-60">
            {busy ? "저장 중..." : "저장"}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-border text-sm px-6 py-2.5 hover:bg-bg">
            취소
          </button>
        </div>
      </form>
  );
}
