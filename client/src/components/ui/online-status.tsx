
<old_str>import { cn } from "@/lib/utils";

interface OnlineStatusProps {
  status: "online" | "idle" | "offline";
  lastActive?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusColors = {
  online: "bg-green-500",
  idle: "bg-yellow-500", 
  offline: "bg-gray-400"
};

const statusText = {
  online: "Online",
  idle: "Idle",
  offline: "Offline"
};

const dotSizes = {
  sm: "w-2 h-2",
  md: "w-3 h-3", 
  lg: "w-4 h-4"
};

const textSizes = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base"
};

export function OnlineStatus({ 
  status, 
  lastActive, 
  showText = true, 
  size = "md",
  className 
}: OnlineStatusProps) {
  // Format last active time
  const formattedLastActive = lastActive ? (() => {
    const now = new Date();
    const lastActiveDate = new Date(lastActive);
    const diffInMs = now.getTime() - lastActiveDate.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    
    if (diffInMinutes < 1) return "just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  })() : null;

  // Simple status indicator with dot and text
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <span className={cn("rounded-full block", dotSizes[size], statusColors[status])} />
      {showText && <span className={cn("font-medium", textSizes[size])}>{statusText[status]}</span>}
      {formattedLastActive && (status === "idle" || status === "offline") && (
        <span className="text-xs text-muted-foreground">
          ({formattedLastActive})
        </span>
      )}
    </span>
  );
}
</old_str>
<new_str>import { cn } from "@/lib/utils";

interface OnlineStatusProps {
  status: "online" | "idle" | "offline";
  lastActive?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusColors = {
  online: "bg-green-500",
  idle: "bg-yellow-500", 
  offline: "bg-gray-400"
};

const statusText = {
  online: "Online",
  idle: "Idle",
  offline: "Offline"
};

const dotSizes = {
  sm: "w-2 h-2",
  md: "w-3 h-3", 
  lg: "w-4 h-4"
};

const textSizes = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base"
};

export function OnlineStatus({ 
  status, 
  lastActive, 
  showText = true, 
  size = "md",
  className 
}: OnlineStatusProps) {
  // Format last active time
  const formattedLastActive = lastActive ? (() => {
    const now = new Date();
    const lastActiveDate = new Date(lastActive);
    const diffInMs = now.getTime() - lastActiveDate.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    
    if (diffInMinutes < 1) return "just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  })() : null;

  // Simple status indicator with dot and text - using only inline elements
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span 
        className={cn("inline-block rounded-full", dotSizes[size], statusColors[status])}
        aria-label={`Status: ${statusText[status]}`}
      />
      {showText && (
        <span className={cn("font-medium", textSizes[size])}>
          {statusText[status]}
        </span>
      )}
      {formattedLastActive && (status === "idle" || status === "offline") && (
        <span className="text-xs text-muted-foreground">
          ({formattedLastActive})
        </span>
      )}
    </span>
  );
}
</new_str>
