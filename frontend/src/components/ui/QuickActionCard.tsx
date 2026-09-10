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
}

export function QuickActionCard({ to, title, description, icon: Icon, tile }: QuickActionCardProps) {
  return (
    <Link
      to={to}
      className={`rounded-2xl p-5 border border-border/60 hover:opacity-90 transition-opacity ${tileStyles[tile]}`}
    >
      <Icon size={22} />
      <p className="mt-3 font-medium">{title}</p>
      <p className="text-xs mt-1 opacity-80">{description}</p>
    </Link>
  );
}
