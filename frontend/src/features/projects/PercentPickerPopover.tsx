import { useEffect, useRef } from "react";

const OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

interface PercentPickerPopoverProps {
  value: number;
  onSelect: (value: number) => void;
  onClose: () => void;
}

export function PercentPickerPopover({ value, onSelect, onClose }: PercentPickerPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="absolute z-20 top-full left-0 mt-1.5 bg-surface border border-border rounded-lg shadow-lg p-2 grid grid-cols-4 gap-1.5 w-56"
    >
      {OPTIONS.map((v) => (
        <button
          key={v}
          onClick={() => {
            onSelect(v);
            onClose();
          }}
          className={`text-xs px-2 py-1.5 rounded-md font-medium transition-colors ${
            value === v ? "bg-primary text-white" : "border border-border text-text-muted hover:bg-bg"
          }`}
        >
          {v}%
        </button>
      ))}
    </div>
  );
}
