import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { hexToHsv, hsvToHex, normalizeHex, textOnAccent, type Hsv } from "./mailAccent";

interface Props {
  /** 열 때 시작하는 색 (지금 쓰는 색) */
  initial: string;
  onConfirm: (hex: string) => void;
  onCancel: () => void;
}

/**
 * 메일 색상 "직접 고르기" 작은 창: 색 사각형 + 색상 막대 + 색 코드. [확인]을 눌러야 적용되고 [취소]·Esc·바깥 클릭은 원래 색을 그대로 둔다.
 */
export function MailColorPicker({ initial, onConfirm, onCancel }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(initial));
  const [text, setText] = useState(initial);
  const boxRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onCancel();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onCancel]);

  function update(next: Hsv) {
    setHsv(next);
    setText(hsvToHex(next));
  }

  function pickFromArea(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    update({ h: hsv.h, s, v });
  }

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="메일 색상 직접 고르기"
      className="absolute left-3 right-3 bottom-full mb-2 z-20 rounded-2xl border border-border bg-surface p-3.5 shadow-xl"
    >
      <div
        ref={areaRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pickFromArea(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pickFromArea(e);
        }}
        className="relative h-32 cursor-crosshair touch-none rounded-xl"
        style={{
          backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
        }}
      >
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }}
        />
      </div>

      <input
        type="range"
        min={0}
        max={360}
        value={Math.round(hsv.h)}
        aria-label="색상"
        onChange={(e) => update({ ...hsv, h: Number(e.target.value) })}
        className="mail-hue my-3 block h-3 w-full cursor-pointer appearance-none rounded-full"
        style={{ backgroundImage: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
      />

      <div className="flex items-center gap-2">
        <span className="h-7 w-7 shrink-0 rounded-lg border border-border" style={{ backgroundColor: hex }} aria-hidden="true" />
        <input
          value={text}
          aria-label="색 코드"
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            const ok = normalizeHex(e.target.value);
            if (ok) setHsv(hexToHsv(ok));
          }}
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[13px]"
        />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3.5 py-1.5 text-[13px] font-semibold hover:bg-bg">
          취소
        </button>
        <button
          type="button"
          onClick={() => onConfirm(hex)}
          className="rounded-lg px-3.5 py-1.5 text-[13px] font-semibold"
          style={{ backgroundColor: hex, color: textOnAccent(hex) }}
        >
          확인
        </button>
      </div>
    </div>
  );
}
