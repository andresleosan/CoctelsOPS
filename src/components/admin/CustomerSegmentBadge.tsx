import { Clock, Crown, Sparkles, TrendingUp } from "lucide-react";

import { CUSTOMER_SEGMENTS, type CustomerSegment } from "@/lib/customers/crm";
import { cn } from "@/lib/utils";

interface CustomerSegmentBadgeProps {
  segment: CustomerSegment;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

export function CustomerSegmentBadge({
  segment,
  size = "sm",
  showIcon = true,
  className,
}: CustomerSegmentBadgeProps) {
  const meta = CUSTOMER_SEGMENTS[segment] ?? CUSTOMER_SEGMENTS.nuevo;

  const renderIcon = () => {
    const iconSizeClass = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

    switch (segment) {
      case "vip":
        return <Crown className={cn(iconSizeClass, "text-fuchsia-400 shrink-0")} aria-hidden="true" />;
      case "frecuente":
        return <TrendingUp className={cn(iconSizeClass, "text-cyan-400 shrink-0")} aria-hidden="true" />;
      case "inactivo":
        return <Clock className={cn(iconSizeClass, "text-amber-400 shrink-0")} aria-hidden="true" />;
      case "nuevo":
      default:
        return <Sparkles className={cn(iconSizeClass, "text-emerald-400 shrink-0")} aria-hidden="true" />;
    }
  };

  return (
    <span
      data-testid={`customer-segment-${segment}`}
      title={meta.description}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border transition-colors",
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
        meta.badgeClass,
        className
      )}
    >
      {showIcon && renderIcon()}
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", meta.dotClass)} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}
