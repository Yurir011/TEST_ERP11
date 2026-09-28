import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

type Tile = "blue" | "green" | "purple" | "orange";

const tileStyles: Record<Tile, string> = {
  blue: "bg-tile-blue text-tile-blue-fg",
  green: "bg-tile-green text-tile-green-fg",
  purple: "bg-tile-purple text-tile-purple-fg",
  orange: "bg-tile-orange text-tile-orange-fg",
};

interface QuickActionCardProps {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tile: Tile;
  /** 좁은 컬럼 등에서 쓰는 축소형 - 아이콘+제목 한 줄, 설명 텍스트 생략 */
  compact?: boolean;
}

export function QuickActionCard({ to, title, description, icon: Icon, tile, compact = false }: QuickActionCardProps) {
  const className = compact
    ? `rounded-xl px-3.5 py-3 border border-border/60 hover:opacity-90 transition-opacity flex items-center gap-2 ${tileStyles[tile]}`
    : `rounded-2xl p-5 border border-border/60 hover:opacity-90 transition-opacity ${tileStyles[tile]}`;
  const content = compact ? (
    <>
      <Icon size={16} className="shrink-0" />
      <p className="text-xs font-semibold truncate">{title}</p>
    </>
  ) : (
    <>
      <Icon size={22} />
      <p className="mt-3 font-medium">{title}</p>
      <p className="text-xs mt-1 opacity-80">{description}</p>
    </>
  );

  if (to.startsWith("#")) {
    return (
      <a href={to} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link to={to} className={className}>
      {content}
    </Link>
  );
}
