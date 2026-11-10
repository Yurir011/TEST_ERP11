import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiGet } from "../../lib/api";
import { isAdminRole } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { CodeText } from "./CodeText";
import { MovementList } from "./MovementList";
import { MovementModal } from "./MovementModal";
import { SubLevelView } from "./SubLevelTree";
import { CATEGORY_BADGE, CATEGORY_LABELS, HISTORY_TABS, formatQty, formatReelQty, matchHistoryTab, netOutQty, purchasedQty, type HistoryTab, type MaterialDetail, type MovementKind } from "./types";

/** 자재 상세: 현재 개수(= 입고 + 추가 입고 − 출고), 속성 트리, 입출고 이력. [추가 입고]·[출고]로 한 줄씩 기록한다. */
export function MaterialDetailPage() {
  const { id } = useParams();
  const materialId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const dialog = useDialog();
  const isAdmin = !!user && isAdminRole(user.role);
  const [m, setM] = useState<MaterialDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<MovementKind | null>(null);
  const [tab, setTab] = useState<HistoryTab>("all");

  useEffect(() => {
    logDebug("MaterialDetail", `상세 조회 시작: id=${materialId}`);
    apiGet<MaterialDetail>(`/api/materials/${materialId}`)
      .then(setM)
      .catch((err) => {
        logError("MaterialDetail", "상세 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "자재를 불러오지 못했습니다.");
      });
  }, [materialId]);

  async function removeMaterial() {
    if (!m || !(await dialog.confirm(`'${m.name}' 자재를 삭제할까요?\n입출고 기록도 모두 함께 지워지고 되돌릴 수 없습니다.`, { okLabel: "삭제", danger: true }))) return;
    try {
      logDebug("MaterialDetail", `자재 삭제 시도: id=${m.id}`);
      await apiDelete(`/api/materials/${m.id}`);
      navigate("/materials", { replace: true });
    } catch (err) {
      logError("MaterialDetail", "자재 삭제 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  async function removeMovement(movementId: number) {
    if (!m || !(await dialog.confirm("이 입출고 기록을 지울까요?\n현재 개수가 다시 계산됩니다.", { okLabel: "지우기", danger: true }))) return;
    try {
      logDebug("MaterialDetail", `입출고 기록 삭제 시도: material_id=${m.id}, movement_id=${movementId}`);
      await apiDelete(`/api/materials/${m.id}/movements/${movementId}`);
      setM(await apiGet<MaterialDetail>(`/api/materials/${m.id}`));
    } catch (err) {
      logError("MaterialDetail", "입출고 기록 삭제 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "지우지 못했습니다.");
    }
  }

  if (!m) {
    return (
      <MainLayout title="자재 상세" showBack>
        {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-sm text-text-muted">불러오는 중...</p>}
      </MainLayout>
    );
  }

  const hasFirstIn = m.movements.some((x) => x.kind === "in");
  const shown = m.movements.filter((x) => matchHistoryTab(x, tab));
  const countOf = (k: HistoryTab) => m.movements.filter((x) => matchHistoryTab(x, k)).length;

  return (
    <MainLayout
      title="자재 상세"
      showBack
      actions={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(`/materials/${m.id}/edit`)} className="rounded-lg border border-border text-sm px-4 py-2.5 hover:bg-bg">
            수정
          </button>
          {isAdmin && (
            <button type="button" onClick={() => void removeMaterial()} className="rounded-lg border border-border text-danger text-sm px-4 py-2.5 hover:bg-bg">
              삭제
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4 max-w-5xl">
        <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6" aria-label="자재 정보">
          <div className="flex flex-wrap justify-between gap-x-8 gap-y-5">
            <div className="min-w-0 flex-1 basis-72">
              <div className="flex flex-wrap items-center gap-2">
                <CodeText code={m.code} />
                <span className={`px-2 py-0.5 text-xs font-semibold ${CATEGORY_BADGE[m.category]}`}>{m.kind_label ? `${CATEGORY_LABELS[m.category]} · ${m.kind_label}` : CATEGORY_LABELS[m.category]}</span>
              </div>
              <h2 className="text-xl font-extrabold mt-2 break-all">{m.name}</h2>
              <div className="mt-2.5">
                <SubLevelView levels={m.sub_levels} />
              </div>
              {m.memo && <p className="text-xs text-text-muted mt-3 whitespace-pre-wrap">메모: {m.memo}</p>}
            </div>

            <div className="sm:text-right">
              <p className="text-xs text-text-muted">현재 개수</p>
              <p className="text-4xl font-extrabold tabular-nums leading-tight" aria-label="현재 개수">
                {m.current_reels != null ? (
                  <>
                    {formatQty(m.current_reels)}
                    <span className="text-lg font-bold ml-0.5">릴</span>
                    <span className="text-xl font-bold text-text-muted ml-2">({formatReelQty(m.current_qty)})</span>
                  </>
                ) : (
                  <>
                    {formatQty(m.current_qty)}
                    <span className="text-sm font-medium text-text-muted ml-1">개</span>
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-2 mt-3 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModalKind(hasFirstIn ? "add" : "in")}
                  className="rounded-lg bg-success text-white text-sm font-medium px-4 py-2.5 hover:opacity-90"
                >
                  + {hasFirstIn ? "추가 입고" : "입고"}
                </button>
                <button
                  type="button"
                  onClick={() => setModalKind("return")}
                  disabled={!m.movements.some((x) => x.kind === "out")}
                  className="rounded-lg bg-tile-orange-fg text-white text-sm font-medium px-4 py-2.5 hover:opacity-90 disabled:opacity-40"
                >
                  ↩ 재입고
                </button>
                <button type="button" onClick={() => setModalKind("out")} disabled={m.current_qty <= 0} className="rounded-lg bg-danger text-white text-sm font-medium px-4 py-2.5 hover:opacity-90 disabled:opacity-40">
                  − 출고
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" aria-label="입출고 요약">
          <div className="rounded-xl bg-surface border border-border px-4 py-3 text-xs text-text-muted">
            입고 (구매분)
            <b className="block text-lg text-text tabular-nums">{formatQty(purchasedQty(m))}</b>
          </div>
          <div className="rounded-xl bg-surface border border-border px-4 py-3 text-xs text-text-muted">
            출고
            <b className="block text-lg text-text tabular-nums">{formatQty(m.total_out)}</b>
            {m.total_return > 0 && <span className="text-[11px]">재입고 {formatQty(m.total_return)} 반납</span>}
          </div>
          <div className="rounded-xl bg-surface border border-border px-4 py-3 text-xs text-text-muted">
            순 출고 (실제 사용)
            <b className="block text-lg text-text tabular-nums">{formatQty(netOutQty(m))}</b>
          </div>
          <div className="rounded-xl bg-tile-orange/50 border border-border px-4 py-3 text-xs text-tile-orange-fg">
            로스 (정산된 건)
            <b className="block text-lg tabular-nums">{formatQty(m.total_loss)}개</b>
          </div>
        </div>

        <section className="bg-surface border border-border rounded-2xl p-5" aria-label="입출고 이력">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold">입출고 이력 (최근순)</h2>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="이력 구분">
              {HISTORY_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-full border px-3 py-1 text-xs ${tab === t.key ? "border-primary bg-tile-blue text-tile-blue-fg font-semibold" : "border-border text-text-muted hover:bg-bg"}`}
                >
                  {t.label} {countOf(t.key)}
                </button>
              ))}
            </div>
          </div>
          {m.movements.length === 0 ? (
            <p className="text-sm text-text-muted py-6 text-center">아직 입출고 기록이 없습니다. [입고]로 처음 개수를 기록해 주세요.</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-text-muted py-6 text-center">이 구분의 기록이 없습니다.</p>
          ) : (
            <MovementList movements={shown} lookup={m.movements} isAdmin={isAdmin} onRemove={(id) => void removeMovement(id)} />
          )}
        </section>
      </div>

      {modalKind && (
        <MovementModal
          material={m}
          kind={modalKind}
          onClose={() => setModalKind(null)}
          onSaved={(saved) => {
            setM(saved);
            setModalKind(null);
          }}
        />
      )}
    </MainLayout>
  );
}
