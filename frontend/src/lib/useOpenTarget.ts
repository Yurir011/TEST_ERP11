import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/** 업무 알림 링크(?open=문서ID)로 들어왔을 때 열어야 할 문서 id를 돌려준다. 없으면 null. */
export function useOpenTarget(override?: number | null): number | null {
  const [searchParams] = useSearchParams();
  if (override !== undefined && override !== null) return override;
  const raw = searchParams.get("open");
  const id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : null;
}

/**
 * 대시보드 업무 알림처럼 페이지 이동 없이 상세 모달만 띄울 때 각 페이지에 넘기는 props.
 * 페이지는 데이터를 불러와 모달과 승인/반려 처리만 수행하고, 모달을 닫거나 결재가 끝나면 호출한 쪽에 알린다.
 */
export interface OpenOverlayProps {
  openId?: number | null;
  modalOnly?: boolean;
  onDecided?: () => void;
  onModalClose?: () => void;
}

export const openTargetDomId = (id: number) => `open-target-${id}`;

/** 목록 화면에서 알림이 가리키는 행으로 스크롤한다 (상세 모달이 없는 화면용). 데이터가 준비된 뒤 한 번만 동작한다. */
export function useScrollToOpenTarget(targetId: number | null, ready: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (targetId === null || !ready || done.current) return;
    const el = document.getElementById(openTargetDomId(targetId));
    if (!el) return;
    done.current = true;
    console.debug(`[OpenTarget] 알림 대상으로 스크롤: id=${targetId}`);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [targetId, ready]);
}
