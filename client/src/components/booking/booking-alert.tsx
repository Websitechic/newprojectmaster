import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Users, X, ExternalLink } from "lucide-react";
import { format, isAfter, startOfDay } from "date-fns";

interface Booking {
  id: number;
  title: string;
  description: string;
  type: string;
  scheduledBy: number;
  participants: number[];
  startTime: string;
  endTime: string;
  status: string;
  meetingLink?: string;
  notes?: string;
  createdAt: string;
  schedulerName: string;
}

export function BookingAlert() {
  const [dismissedBookings, setDismissedBookings] = useState<number[]>(() => {
    const saved = localStorage.getItem('dismissedBookings');
    return saved ? JSON.parse(saved) : [];
  });

  // Fetch upcoming bookings for current user
  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ["/api/bookings/my-upcoming"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Filter bookings that should show alerts
  const alertBookings = bookings.filter(booking => {
    const meetingDate = new Date(booking.startTime);
    const today = startOfDay(new Date());
    
    // Show alert if:
    // 1. Booking is scheduled for today or future
    // 2. Booking status is "scheduled"
    // 3. User hasn't dismissed this booking
    return (
      isAfter(meetingDate, today) || 
      format(meetingDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
    ) && 
    booking.status === "scheduled" && 
    !dismissedBookings.includes(booking.id);
  });

  const dismissBooking = (bookingId: number) => {
    const newDismissed = [...dismissedBookings, bookingId];
    setDismissedBookings(newDismissed);
    localStorage.setItem('dismissedBookings', JSON.stringify(newDismissed));
  };

  const getTypeBadge = (type: string) => {
    const colors = {
      one_on_one: "bg-blue-100 text-blue-800",
      team_booking: "bg-green-100 text-green-800", 
      marketing_meeting: "bg-purple-100 text-purple-800",
      general_booking: "bg-gray-100 text-gray-800"
    };

    const labels = {
      one_on_one: "One-on-One",
      team_booking: "Team Meeting",
      marketing_meeting: "Marketing Call",
      general_booking: "General Meeting"
    };

    return (
      <Badge className={colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {labels[type as keyof typeof labels] || type}
      </Badge>
    );
  };

  const isToday = (dateString: string) => {
    return format(new Date(dateString), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  };

  const isTomorrow = (dateString: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return format(new Date(dateString), 'yyyy-MM-dd') === format(tomorrow, 'yyyy-MM-dd');
  };

  const getTimeText = (startTime: string, endTime: string) => {
    // Extract time portion directly from ISO string to avoid timezone conversion
    const startTimeStr = startTime.slice(11, 16); // HH:MM
    const endTimeStr = endTime.slice(11, 16);
    
    if (isToday(startTime)) {
      return `Today at ${startTimeStr} - ${endTimeStr}`;
    } else if (isTomorrow(startTime)) {
      return `Tomorrow at ${startTimeStr} - ${endTimeStr}`;
    } else {
      return `${format(new Date(startTime), "MMM d, yyyy")} at ${startTimeStr} - ${endTimeStr}`;
    }
  };

  if (alertBookings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mb-6">
      {alertBookings.map((booking) => (
        <Alert key={booking.id} className="border-blue-200 bg-blue-50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-blue-900">Upcoming Meeting</span>
                {getTypeBadge(booking.type)}
              </div>
              
              <AlertDescription className="text-blue-800">
                <div className="space-y-2">
                  <div className="font-medium text-lg">{booking.title}</div>
                  
                  {booking.description && (
                    <div className="text-sm">{booking.description}</div>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {getTimeText(booking.startTime, booking.endTime)}
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {booking.participants.length} participant{booking.participants.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {booking.meetingLink && (
                    <div className="flex items-center gap-2">
                      <a 
                        href={booking.meetingLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline text-sm"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Join Meeting
                      </a>
                    </div>
                  )}

                  {booking.notes && (
                    <div className="text-sm bg-blue-100 p-2 rounded">
                      <strong>Notes:</strong> {booking.notes}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismissBooking(booking.id)}
              className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
}