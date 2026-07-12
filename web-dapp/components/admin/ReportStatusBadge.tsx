"use client";

import { getStatusMeta } from "@/lib/reportHelpers";

interface ReportStatusBadgeProps {
  status: number;
  showDot?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function ReportStatusBadge({
  status,
  showDot = false,
  size = "md",
  className = "",
}: ReportStatusBadgeProps) {
  const meta = getStatusMeta(status);
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px]"
      : "px-3 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold border ${meta.bg} ${meta.text} ${meta.border} ${sizeClasses} ${className}`}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      )}
      {meta.label}
    </span>
  );
}
