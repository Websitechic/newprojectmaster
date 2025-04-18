import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO, isValid } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string | Date | null | undefined, formatStr: string = "MMM d, yyyy"): string {
  if (!dateString) return "N/A";
  
  try {
    const date = typeof dateString === "string" ? parseISO(dateString) : dateString;
    
    if (!isValid(date)) {
      return "Invalid date";
    }
    
    return format(date, formatStr);
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Error";
  }
}
