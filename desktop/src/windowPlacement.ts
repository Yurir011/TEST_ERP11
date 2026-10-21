// 창이 화면 밖(연결을 뺀 모니터 등)에 있어 안 보이는 경우를 가려내는 순수 함수. 시험하기 쉽게 main.ts 에서 분리했다.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 창의 일부(최소 minVisible px 사각형)라도 어느 화면의 작업 영역 안에 보이면 true */
export function isVisibleOnAnyDisplay(bounds: Rect, workAreas: Rect[], minVisible = 80): boolean {
  return workAreas.some((area) => {
    const w = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const h = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return w >= minVisible && h >= minVisible;
  });
}
