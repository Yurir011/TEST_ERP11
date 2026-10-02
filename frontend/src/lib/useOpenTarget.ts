import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/** 업무 알림 링크(?open=문서ID)로 들어왔을 때 열어야 할 문서 id를 돌려준다. 없으면 null. */
export function useOpenTarget(): number | null {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("open");
  const id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : null;
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
