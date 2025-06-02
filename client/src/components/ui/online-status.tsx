import React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface OnlineStatusProps {
  status: "online" | "offline" | "idle";
  lastActive?: string | Date | null;
  showText?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function OnlineStatus({
  status,
  lastActive,
  showText = true,
  className,
  size = "md",
}: OnlineStatusProps) {
  const statusColors = {
    online: "bg-green-500",
    idle: "bg-amber-400",
    offline: "bg-gray-400",
  };

  const statusText = {
    online: "Online",
    idle: "Idle",
    offline: "Offline",
  };

  const dotSizes = {
    sm: "w-2 h-2",
    md: "w-3 h-3", 
    lg: "w-4 h-4",
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  // Format time since last active
  const formattedLastActive = lastActive 
    ? formatDistanceToNow(new Date(lastActive), { addSuffix: true })
    : null;

  // Simple status indicator with dot and text
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <div className={cn("rounded-full", dotSizes[size], statusColors[status])} />
      {showText && <span className={cn("font-medium", textSizes[size])}>{statusText[status]}</span>}
      {formattedLastActive && (status === "idle" || status === "offline") && (
        <span className={cn("text-muted-foreground", textSizes[size])}>
          ({formattedLastActive})
        </span>
      )}
    </span>
  );
}

export function OnlineStatusBadge({
  status,
  lastActive,
  showText = true,
  className,
}: Omit<OnlineStatusProps, "size">) {
  const statusColors = {
    online: "bg-green-100 text-green-800 border-green-200",
    idle: "bg-amber-100 text-amber-700 border-amber-200",
    offline: "bg-gray-100 text-gray-700 border-gray-200",
  };

  const statusText = {
    online: "Online",
    idle: "Idle",
    offline: "Offline",
  };

  // Format time since last active
  const formattedLastActive = lastActive && (status === "idle" || status === "offline")
    ? formatDistanceToNow(new Date(lastActive), { addSuffix: true })
    : null;

  return (
    <Badge 
      variant="outline" 
      className={cn(statusColors[status], className)}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn("rounded-full w-2 h-2", statusColors[status])} />
        {showText && (
          <>
            {statusText[status]}
            {formattedLastActive && (
              <span className="ml-1 text-xs opacity-80">
                ({formattedLastActive})
              </span>
            )}
          </>
        )}
      </span>
    </Badge>
  );
}