import React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    
  const statusIndicator = (
    <div className="flex items-center gap-1.5">
      <div className={cn("rounded-full", dotSizes[size], statusColors[status])} />
      {showText && <span className={cn("font-medium", textSizes[size])}>{statusText[status]}</span>}
    </div>
  );
  
  // If there's no last active time or user is online, just show the status
  if (!lastActive || status === "online") {
    return <div className={cn("flex items-center", className)}>{statusIndicator}</div>;
  }
  
  // If offline or idle, show the tooltip with "last seen" information
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center cursor-default", className)}>
            {statusIndicator}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="text-xs">
          Last seen {formattedLastActive}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  const formattedLastActive = lastActive 
    ? formatDistanceToNow(new Date(lastActive), { addSuffix: true })
    : null;
  
  // If offline and we have last active info, add tooltip
  if ((status === "offline" || status === "idle") && lastActive) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn("cursor-default", statusColors[status], className)}
            >
              <div className="flex items-center gap-1.5">
                <div className={cn("rounded-full w-2 h-2", statusColors[status])} />
                {showText && statusText[status]}
              </div>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className="text-xs">
            Last seen {formattedLastActive}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  // Simple badge for online status or when no lastActive is available
  return (
    <Badge 
      variant="outline" 
      className={cn(statusColors[status], className)}
    >
      <div className="flex items-center gap-1.5">
        <div className={cn("rounded-full w-2 h-2", statusColors[status])} />
        {showText && statusText[status]}
      </div>
    </Badge>
  );
}