import { useEffect, useState } from "react";

function describe(el: Element): string {
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 4).join(".") : "";
  return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`.slice(0, 52);
}

/** 화면 폭이 맞지 않을 때 원인을 찾기 위한 진단 표시. 주소 끝에 `?debug=layout` 을 붙였을 때만 나타난다 (평소에는 아무것도 그리지 않는다). */
function collect(): string[] {
  const de = document.documentElement;
  const vv = window.visualViewport;
  const lines = [
    `inner ${window.innerWidth} | client ${de.clientWidth} | scroll ${de.scrollWidth} | body ${document.body.scrollWidth}`,
    `visual ${vv ? `${Math.round(vv.width)} x${vv.scale.toFixed(2)}` : "-"} | screen ${screen.width} | dpr ${window.devicePixelRatio}`,
    `meta ${document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "-"}`,
  ];
  const limit = de.clientWidth;
  const wide: { el: Element; right: number; width: number }[] = [];
  const inner: { el: Element; sw: number; cw: number }[] = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("[data-layout-debug]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > limit + 1) wide.push({ el, right: r.right, width: r.width });
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) inner.push({ el, sw: el.scrollWidth, cw: el.clientWidth });
  }
  wide.sort((a, b) => b.right - a.right);
  lines.push(`폭을 넘는 요소 ${wide.length}개`);
  for (const w of wide.slice(0, 6)) lines.push(`  ${describe(w.el)} 오른쪽 ${Math.round(w.right)} 폭 ${Math.round(w.width)}`);
  inner.sort((a, b) => b.sw - b.cw - (a.sw - a.cw));
  lines.push(`안쪽이 넘치는 요소 ${inner.length}개`);
  for (const n of inner.slice(0, 4)) lines.push(`  ${describe(n.el)} 내용 ${n.sw} > 칸 ${n.cw}`);
  return lines;
}

export function LayoutDebug() {
  const enabled = typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "layout";
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const run = () => setLines(collect());
    const first = window.setTimeout(run, 800);
    const second = window.setTimeout(run, 2500); // 이미지·글꼴이 모두 불러와진 뒤 한 번 더
    window.addEventListener("resize", run);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
      window.removeEventListener("resize", run);
    };
  }, [enabled]);

  if (!enabled || !lines) return null;
  return (
    <pre data-layout-debug className="fixed top-0 left-0 z-[200] m-0 w-[min(100%,26rem)] bg-black/85 text-white text-[10px] leading-tight p-2 whitespace-pre-wrap break-all pointer-events-none">
      {lines.join("\n")}
    </pre>
  );
}
