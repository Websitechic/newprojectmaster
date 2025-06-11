
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Users, X, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

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

const BOOKING_TYPES = {
  one_on_one: "One-on-One",
  team_booking: "Team Meeting",
  marketing_meeting: "Marketing Call",
  general_booking: "General Meeting"
};

export function MeetingAlert() {
  const { user } = useAuth();
  const [dismissedMeetings, setDismissedMeetings] = useState<number[]>([]);

  const { data: bookings } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    queryFn: () => fetch("/api/bookings").then(res => {
      if (!res.ok) throw new Error('Failed to fetch bookings');
      return res.json();
    }),
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds to get new bookings
  });

  // Filter bookings for current user that are upcoming and not dismissed
  const userMeetings = bookings?.filter(booking => {
    const meetingDate = new Date(booking.startTime);
    const today = new Date();
    const isUpcoming = meetingDate >= today;
    const isParticipant = booking.participants.includes(user?.id || 0);
    const notDismissed = !dismissedMeetings.includes(booking.id);
    
    return isParticipant && isUpcoming && notDismissed && booking.status === "scheduled";
  }) || [];

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  };

  const dismissMeeting = (meetingId: number) => {
    setDismissedMeetings(prev => [...prev, meetingId]);
  };

  const isNewMeeting = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const timeDiff = now.getTime() - created.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);
    return hoursDiff < 24; // Consider new if created within last 24 hours
  };

  // Store dismissed meetings in localStorage
  useEffect(() => {
    const stored = localStorage.getItem('dismissedMeetings');
    if (stored) {
      setDismissedMeetings(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('dismissedMeetings', JSON.stringify(dismissedMeetings));
  }, [dismissedMeetings]);

  if (!userMeetings.length) {
    return null;
  }

  return (
    <div className="px-6 pt-4 space-y-3">
      {userMeetings.map((meeting) => {
        const { date, time } = formatDateTime(meeting.startTime);
        const { time: endTime } = formatDateTime(meeting.endTime);
        const isNew = isNewMeeting(meeting.createdAt);

        return (
          <Alert key={meeting.id} className="border-blue-200 bg-blue-50 relative">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <AlertTitle className="text-blue-900 flex items-center gap-2">
                    {meeting.title}
                    {isNew && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                        New
                      </Badge>
                    )}
                  </AlertTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissMeeting(meeting.id)}
                    className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <AlertDescription className="text-blue-800">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>{date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>{time} - {endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{BOOKING_TYPES[meeting.type as keyof typeof BOOKING_TYPES]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">Scheduled by: {meeting.schedulerName}</span>
                    </div>
                  </div>
                  
                  {meeting.description && (
                    <p className="mt-2 text-sm">{meeting.description}</p>
                  )}
                  
                  <div className="flex items-center gap-2 mt-3">
                    {meeting.meetingLink && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(meeting.meetingLink, '_blank')}
                        className="text-blue-700 border-blue-200 hover:bg-blue-100"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Join Meeting
                      </Button>
                    )}
                  </div>
                </AlertDescription>
              </div>
            </div>
          </Alert>
        );
      })}
    </div>
  );
}
