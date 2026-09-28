import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down";
  icon: LucideIcon;
  to?: string;
}

export function StatCard({ label, value, change, trend, icon: Icon, to }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-text-muted">{label}</p>
        <Icon size={16} className="text-text-muted" />
      </div>
      <p className="text-2xl font-semibold text-text">{value}</p>
      {change && (
        <p className={`text-xs mt-2 ${trend === "down" ? "text-danger" : "text-success"}`}>
          {trend === "down" ? "↘" : "↗"} {change}
        </p>
      )}
    </>
  );

  const linkClassName = "block bg-surface border border-border rounded-2xl p-5 hover:border-tile-blue-fg/40 hover:shadow-sm transition-all";

  if (to?.startsWith("#")) {
    return (
      <a href={to} className={linkClassName}>
        {content}
      </a>
    );
  }

  if (to) {
    return (
      <Link to={to} className={linkClassName}>
        {content}
      </Link>
    );
  }

  return <div className="bg-surface border border-border rounded-2xl p-5">{content}</div>;
}
