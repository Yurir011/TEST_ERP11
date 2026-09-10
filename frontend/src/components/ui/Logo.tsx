import { Crosshair } from "lucide-react";

interface LogoProps {
  iconSize?: number;
  textSize?: number;
  className?: string;
}

export function Logo({ iconSize = 26, textSize = 20, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Crosshair size={iconSize} strokeWidth={2.4} className="text-text shrink-0" />
      <span className="font-extrabold tracking-tight text-text" style={{ fontSize: textSize }}>
        BENCH
      </span>
    </div>
  );
}
