import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down";
  icon: LucideIcon;
}

export function StatCard({ label, value, change, trend, icon: Icon }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
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
    </div>
  );
}
