import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiGet } from "../../lib/api";
import { isAdminRole } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import { CodeText } from "../materials/CodeText";
import { NewMaterialButton } from "../materials/NewMaterialButton";
import { MovementList } from "../materials/MovementList";
import { MovementModal } from "../materials/MovementModal";
import { SubLevelView } from "../materials/SubLevelTree";
import { CATEGORY_BADGE, CATEGORY_LABELS, formatQty, formatReelQty, levelPath, netOutQty, purchasedQty, type MaterialDetail, type Movement, type MovementKind } from "../materials/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

/** 모바일 자재 상세: 현재 개수(= 입고 + 추가 입고 − 출고), 속성, 입출고 이력. 아래 [추가 입고]·[출고]로 기록한다 (출고는 사유 필수). */
export function MobileMaterialDetailPage() {
  const { id } = useParams();
  const materialId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const dialog = useDialog();
  const isAdmin = !!user && isAdminRole(user.role);
  const [m, setM] = useState<MaterialDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<MovementKind | null>(null);
  const [editing, setEditing] = useState<Movement | null>(null); // 수정 중인 입출고 기록

  useEffect(() => {
    logDebug("MobileMaterialDetail", `상세 조회 시작: id=${materialId}`);
    apiGet<MaterialDetail>(`/api/materials/${materialId}`)
      .then(setM)
      .catch((err) => {
        logError("MobileMaterialDetail", "상세 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "자재를 불러오지 못했습니다.");
      });
  }, [materialId]);

  async function removeMovement(movementId: number) {
    if (!m || !(await dialog.confirm("이 입출고 기록을 지울까요?\n현재 개수가 다시 계산됩니다.", { okLabel: "지우기", danger: true }))) return;
    try {
      logDebug("MobileMaterialDetail", `입출고 기록 삭제 시도: material_id=${m.id}, movement_id=${movementId}`);
      await apiDelete(`/api/materials/${m.id}/movements/${movementId}`);
      setM(await apiGet<MaterialDetail>(`/api/materials/${m.id}`));
    } catch (err) {
      logError("MobileMaterialDetail", "입출고 기록 삭제 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "지우지 못했습니다.");
    }
  }

  if (!m) {
    return <MobileLayout title="자재" backTo="/m/materials">{error ? <p className="text-sm text-danger">{error}</p> : <MobileEmpty text="불러오는 중..." />}</MobileLayout>;
  }

  const hasFirstIn = m.movements.some((x) => x.kind === "in");

  return (
    <MobileLayout
      title={m.name}
      backTo="/m/materials"
      right={
        <div className="flex items-center">
          <NewMaterialButton mobile />
          <button type="button" onClick={() => navigate(`/m/materials/${m.id}/edit`)} className="px-3 h-10 text-sm text-primary">
            수정
          </button>
        </div>
      }
    >
      <MobileCard>
        <CodeText code={m.code} small className="block truncate mb-1" />
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-1.5 py-0.5 text-[11px] font-semibold ${CATEGORY_BADGE[m.category]}`}>{m.kind_label ? `${CATEGORY_LABELS[m.category]} · ${m.kind_label}` : CATEGORY_LABELS[m.category]}</span>
          <span className="text-xs text-text-muted truncate">{levelPath(m.sub_levels)}</span>
        </div>
        <p className="text-xs text-text-muted">현재 개수</p>
        <p className="text-4xl font-extrabold tabular-nums leading-tight" aria-label="현재 개수">
          {m.current_reels != null ? (
            <>
              {formatQty(m.current_reels)}
              <span className="text-lg font-bold ml-0.5">릴</span>
              <span className="block text-xl font-bold text-text-muted">({formatReelQty(m.current_qty)})</span>
            </>
          ) : (
            <>
              {formatQty(m.current_qty)}
              <span className="text-sm font-medium text-text-muted ml-1">개</span>
            </>
          )}
        </p>
        <p className="text-xs text-text-muted mt-1">
          입고 <b className="text-text">{formatQty(purchasedQty(m))}</b> − 순 출고 <b className="text-text">{formatQty(netOutQty(m))}</b>
          {m.total_return > 0 && <span> (출고 {formatQty(m.total_out)} − 재입고 {formatQty(m.total_return)})</span>}
        </p>
        {m.total_return > 0 && <p className="text-xs mt-1.5"><span className="rounded-md bg-tile-orange/60 text-tile-orange-fg px-2 py-0.5 font-semibold">로스 {formatQty(m.total_loss)}개</span></p>}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button type="button" onClick={() => setModalKind(hasFirstIn ? "add" : "in")} className="rounded-xl bg-success text-white text-sm font-semibold py-3 active:opacity-70">
            + 입고
          </button>
          <button type="button" onClick={() => setModalKind("return")} disabled={!m.movements.some((x) => x.kind === "out")} className="rounded-xl bg-tile-orange-fg text-white text-sm font-semibold py-3 active:opacity-70 disabled:opacity-40">
            ↩ 재입고
          </button>
          <button type="button" onClick={() => setModalKind("out")} disabled={m.current_qty <= 0} className="rounded-xl bg-danger text-white text-sm font-semibold py-3 active:opacity-70 disabled:opacity-40">
            − 출고
          </button>
        </div>
      </MobileCard>

      <MobileCard>
        <h2 className="text-sm font-semibold mb-2">속성</h2>
        <SubLevelView levels={m.sub_levels} />
        {m.memo && <p className="text-xs text-text-muted mt-3 whitespace-pre-wrap">메모: {m.memo}</p>}
      </MobileCard>

      <MobileCard>
        <h2 className="text-sm font-semibold mb-1">입출고 이력 (최근순)</h2>
        {m.movements.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">아직 입출고 기록이 없습니다.</p>
        ) : (
          <MovementList movements={m.movements} onEdit={setEditing} />
        )}
      </MobileCard>

      {(modalKind || editing) && (
        <MovementModal
          material={m}
          kind={editing?.kind ?? modalKind!}
          editing={editing}
          onRemove={
            editing && isAdmin
              ? () => {
                  const id = editing.id;
                  setEditing(null);
                  void removeMovement(id);
                }
              : undefined
          }
          onClose={() => {
            setModalKind(null);
            setEditing(null);
          }}
          onSaved={(saved) => {
            setM(saved);
            setModalKind(null);
            setEditing(null);
          }}
        />
      )}
    </MobileLayout>
  );
}
