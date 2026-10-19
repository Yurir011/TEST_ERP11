import type { ReactNode } from "react";

/**
 * 표 칸 안의 긴 글을 최대 3줄까지만 보여 주고 넘치면 …로 줄인다(전체 글은 마우스를 올리면 툴팁으로).
 * 칸(td)에는 CLAMP_CELL 을 함께 붙여, 화면이 좁아져도 칸들이 같은 비율로 줄어들게 한다.
 */
export const CLAMP_CELL = "max-w-0";

export function ClampText({ children, title }: { children: ReactNode; title?: string }) {
  const tip = title ?? (typeof children === "string" ? children : undefined);
  return (
    <div className="line-clamp-3 break-words" title={tip}>
      {children}
    </div>
  );
}
