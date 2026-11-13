import { Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { fetchFileBytes } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { composeLayers, defaultVisible, layerColor, layerLabel, layerOrder, renderGerberZip, type GerberRender } from "./gerberRender";
import type { Gerber } from "./types";

type Mode = "top" | "bottom" | "layers";
const MIN_SCALE = 0.5;
const MAX_SCALE = 40;

/**
 * 거버 뷰어 팝업. 서버에서 zip 을 받아 브라우저에서 그린다.
 * [실물 위]·[실물 아래]는 색을 입힌 보드 모양, [레이어]는 레이어를 켜고 끄며 겹쳐 본다. 휠로 확대·축소, 끌어서 이동한다.
 */
export function GerberViewerModal({
  projectId,
  gerber,
  onClose,
  versions,
  onPickVersion,
}: {
  projectId: number;
  gerber: Gerber;
  onClose?: () => void;
  /** 새 창에서 열 때: 버전을 골라 바꿀 수 있는 목록 (있으면 팝업이 아니라 창 전체에 그린다) */
  versions?: Gerber[];
  onPickVersion?: (g: Gerber) => void;
}) {
  const embedded = onClose === undefined;
  const [render, setRender] = useState<GerberRender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("layers");
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    let alive = true;
    logDebug("GerberViewer", `거버 불러오기 시작: project_id=${projectId}, id=${gerber.id}`);
    fetchFileBytes(`/api/projects/${projectId}/gerbers/${gerber.id}/file`)
      .then((bytes) => renderGerberZip(bytes))
      .then((r) => {
        if (!alive) return;
        logDebug("GerberViewer", `거버 그리기 성공: 레이어 ${r.layers.length}개, 건너뜀 ${r.skipped.length}개`);
        setRender(r);
        setVisible(defaultVisible(r.layers));
        setMode("layers"); // 처음에는 레이어를 켜고 끄며 보는 화면
      })
      .catch((err) => {
        logError("GerberViewer", "거버 그리기 실패", err);
        if (alive) setError(err instanceof Error ? err.message : "거버를 불러오지 못했습니다.");
      });
    return () => {
      alive = false;
    };
  }, [projectId, gerber.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fit = useCallback(() => setView({ x: 0, y: 0, k: 1 }), []);
  const svg = useMemo(() => {
    if (!render) return "";
    if (mode === "top") return render.boardTop ?? "";
    if (mode === "bottom") return render.boardBottom ?? "";
    return composeLayers(render, visible);
  }, [render, mode, visible]);
  const sorted = useMemo(() => (render ? [...render.layers].sort((a, b) => layerOrder(b) - layerOrder(a)) : []), [render]);

  function zoomAt(factor: number, cx?: number, cy?: number) {
    setView((v) => {
      const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.k * factor));
      const rect = stage.current?.getBoundingClientRect();
      const px = cx ?? (rect ? rect.width / 2 : 0);
      const py = cy ?? (rect ? rect.height / 2 : 0);
      const f = k / v.k;
      return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f }; // 가리킨 점이 그대로 있도록
    });
  }

  function onWheel(e: ReactWheelEvent) {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  }
  function onPointerDown(e: ReactPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  }
  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  const modeBtn = (m: Mode, label: string, disabled = false) => (
    <button
      key={m}
      type="button"
      aria-pressed={mode === m}
      disabled={disabled}
      onClick={() => setMode(m)}
      className={`px-3 py-1.5 text-sm border border-border first:rounded-l-lg last:rounded-r-lg -ml-px first:ml-0 disabled:opacity-40 ${mode === m ? "bg-tile-blue text-primary font-semibold" : "bg-surface hover:bg-bg"}`}
    >
      {label}
    </button>
  );

  return (
    <div className={embedded ? "min-h-screen bg-bg p-3" : "fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-6"} onClick={onClose}>
      <div role="dialog" aria-label="거버 뷰어" onClick={(e) => e.stopPropagation()} className={`flex w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xl ${embedded ? "" : "max-h-full max-w-5xl"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-bold">
            Gerber Viewer · {gerber.revision} <span className="ml-1 text-xs font-normal text-text-muted">{gerber.filename}</span>
          </h2>
          {versions && versions.length > 1 && (
            <select
              aria-label="거버 버전 선택"
              value={gerber.id}
              onChange={(e) => {
                const g = versions.find((v) => v.id === Number(e.target.value));
                if (g) onPickVersion?.(g);
              }}
              className="rounded-lg border border-border bg-bg px-2 py-1.5 text-sm"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.revision}
                  {v.is_latest ? " (최신)" : ""} · {v.filename}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto inline-flex" role="group" aria-label="보기 방식">
            {modeBtn("top", "실물 위", !render?.boardTop)}
            {modeBtn("bottom", "실물 아래", !render?.boardBottom)}
            {modeBtn("layers", "레이어")}
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="닫기" className="rounded-lg p-1.5 text-text-muted hover:bg-bg">
              <X size={18} />
            </button>
          )}
        </div>

        {error && <p className="rounded-lg border border-danger/40 bg-tile-red px-3 py-2 text-sm text-danger">{error}</p>}
        {!error && !render && <p className="py-16 text-center text-sm text-text-muted">거버를 불러오는 중...</p>}

        {render && (
          <div className="grid min-h-0 gap-3 md:grid-cols-[190px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-auto text-sm md:max-h-[62vh]" aria-label="레이어 목록">
              {mode === "layers" ? (
                <>
                  <div className="mb-2 flex gap-1.5 text-xs">
                    <button type="button" onClick={() => setVisible(new Set(render.layers.map((l) => l.id)))} className="rounded border border-border px-2 py-0.5 hover:bg-bg">
                      모두 켜기
                    </button>
                    <button type="button" onClick={() => setVisible(new Set())} className="rounded border border-border px-2 py-0.5 hover:bg-bg">
                      모두 끄기
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {sorted.map((l) => (
                      <li key={l.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-bg">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={visible.has(l.id)}
                            onChange={(e) =>
                              setVisible((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(l.id);
                                else next.delete(l.id);
                                return next;
                              })
                            }
                          />
                          <i className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: layerColor(l) }} />
                          <span className="min-w-0">
                            <span className="block">{layerLabel(l)}</span>
                            <span className="block break-all text-[11px] text-text-muted">{l.filename}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-text-muted">색을 입힌 실물 모양입니다. 레이어별로 켜고 끄려면 [레이어]를 누르세요.</p>
              )}
              {render.skipped.length > 0 && <p className="mt-3 text-[11px] text-text-muted">거버가 아니어서 건너뛴 파일 {render.skipped.length}개: {render.skipped.join(", ")}</p>}
            </div>

            <div className="min-w-0">
              <div
                ref={stage}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={fit}
                className="relative h-[56vh] cursor-grab touch-none overflow-hidden rounded-xl bg-[#08140f] active:cursor-grabbing"
                aria-label="거버 그림 (휠로 확대, 끌어서 이동, 두 번 누르면 처음 크기)"
              >
                <div
                  className="absolute inset-0 p-4 [&>svg]:h-full [&>svg]:w-full"
                  style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                <button type="button" onClick={() => zoomAt(1.4)} aria-label="확대" className="rounded-lg border border-border bg-surface p-1.5 hover:bg-bg">
                  <ZoomIn size={15} />
                </button>
                <button type="button" onClick={() => zoomAt(1 / 1.4)} aria-label="축소" className="rounded-lg border border-border bg-surface p-1.5 hover:bg-bg">
                  <ZoomOut size={15} />
                </button>
                <button type="button" onClick={fit} aria-label="화면에 맞춤" className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1.5 hover:bg-bg">
                  <Maximize2 size={14} /> 맞춤
                </button>
                <span className="ml-2">{Math.round(view.k * 100)}% · 휠로 확대 · 끌어서 이동 · 두 번 누르면 맞춤</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
