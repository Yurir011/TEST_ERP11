import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiGet } from "../../lib/api";
import { isAdminRole } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { MovementModal } from "./MovementModal";
import { SubLevelView } from "./SubLevelTree";
import { CATEGORY_BADGE, CATEGORY_LABELS, KIND_LABELS, formatQty, levelPath, type MaterialDetail, type MovementKind } from "./types";

/** 자재 상세: 현재 개수(= 입고 + 추가 입고 − 출고), 하위 속성 트리, 입출고 이력. [추가 입고]·[출고]로 한 줄씩 기록한다. */
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
  const rootLabel = `${CATEGORY_LABELS[m.category]} · ${m.name}`;

  return (
    <MainLayout
      title={m.name}
      description={levelPath(m.sub_levels) || CATEGORY_LABELS[m.category]}
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
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 max-w-5xl">
        <div className="space-y-4">
          <section className="bg-surface border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 text-xs font-semibold ${CATEGORY_BADGE[m.category]}`}>{CATEGORY_LABELS[m.category]}</span>
              <h2 className="text-sm font-semibold">현재 개수</h2>
            </div>
            <p className="text-4xl font-extrabold tabular-nums">
              {formatQty(m.current_qty)}
              <span className="text-sm font-medium text-text-muted ml-1">개</span>
            </p>
            <p className="text-xs text-text-muted mt-2">
              입고 <b className="text-text">{formatQty(m.total_in)}</b> + 추가 입고 <b className="text-text">{formatQty(m.total_add)}</b> − 출고{" "}
              <b className="text-text">{formatQty(m.total_out)}</b>
            </p>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setModalKind(hasFirstIn ? "add" : "in")}
                className="rounded-lg bg-success text-white text-sm font-medium px-4 py-2.5 hover:opacity-90"
              >
                + {hasFirstIn ? "추가 입고" : "입고"}
              </button>
              <button type="button" onClick={() => setModalKind("out")} disabled={m.current_qty <= 0} className="rounded-lg bg-danger text-white text-sm font-medium px-4 py-2.5 hover:opacity-90 disabled:opacity-40">
                − 출고
              </button>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold mb-3">하위 분류</h2>
            <SubLevelView levels={m.sub_levels} rootLabel={rootLabel} />
            {m.memo && <p className="text-xs text-text-muted mt-4 whitespace-pre-wrap">메모: {m.memo}</p>}
          </section>
        </div>

        <section className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-2">입출고 이력 (최근순)</h2>
          {m.movements.length === 0 ? (
            <p className="text-sm text-text-muted py-6 text-center">아직 입출고 기록이 없습니다. [입고]로 처음 개수를 기록해 주세요.</p>
          ) : (
            <ul>
              {m.movements.map((x) => {
                const out = x.kind === "out";
                return (
                  <li key={x.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-2.5 border-b border-border last:border-0 text-sm">
                    <span className={`px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${out ? "rounded-md bg-tile-red text-danger" : "rounded-md bg-tile-green text-tile-green-fg"}`}>{KIND_LABELS[x.kind]}</span>
                    <span className="min-w-0">
                      <span className="tabular-nums">{x.movement_date}</span>
                      {out && x.reason && <span className="block text-xs text-text-muted truncate">출고 사유: {x.reason}{x.note ? ` · ${x.note}` : ""}</span>}
                      {!out && x.note && <span className="block text-xs text-text-muted truncate">메모: {x.note}</span>}
                      {x.created_by_name && <span className="block text-[11px] text-text-muted">{x.created_by_name}</span>}
                    </span>
                    <b className={`tabular-nums ${out ? "text-danger" : "text-success"}`}>
                      {out ? "−" : "+"}
                      {formatQty(x.quantity)}
                    </b>
                    {isAdmin ? (
                      <button type="button" onClick={() => void removeMovement(x.id)} aria-label="이 기록 지우기" className="text-xs text-text-muted hover:text-danger">
                        지우기
                      </button>
                    ) : (
                      <span />
                    )}
                  </li>
                );
              })}
            </ul>
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
