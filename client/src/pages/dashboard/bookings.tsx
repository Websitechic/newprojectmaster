import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, AlertTriangle, Plus, Edit, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  specialization?: string;
}

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
  one_on_one: "One-on-One Booking",
  team_booking: "Team Booking",
  marketing_meeting: "Marketing Meeting Call",
  general_booking: "General Booking"
};

const MARKETING_SPECIALIZATIONS = [
  "media_buying",
  "operations_manager", 
  "automation",
  "copywriting",
  "product_owner",
  "product_manager",
  "community_manager",
  "design"
];

export default function Bookings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [bookingToDelete, setBookingToDelete] = useState<number | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [formData, setFormData] = useState({
    id: undefined as number | undefined,
    title: "",
    description: "",
    type: "",
    participants: [] as number[],
    startTime: "",
    endTime: "",
    meetingLink: "",
    notes: ""
  });
  const [warning, setWarning] = useState<string | null>(null);

  // Fetch bookings
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["/api/bookings"],
    refetchInterval: 5000, // Optional: auto-refetch every 5s
  });

  // Fetch all users for participant selection
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Create booking mutation
  const createBookingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create booking");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setIsCreateDialogOpen(false);
      resetForm();
      if (data.warning) {
        setWarning(data.warning);
        setTimeout(() => setWarning(null), 5000);
      }
      toast({
        title: "Success",
        description: "Booking created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update booking mutation
  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await fetch(`/api/bookings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to update booking");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setIsEditDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Booking updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete booking mutation
  const deleteBookingMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/bookings/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to delete booking");
      }

      // Check if response has content before parsing JSON
      const responseText = await response.text();
      if (responseText) {
        try {
          return JSON.parse(responseText);
        } catch (e) {
          return { success: true };
        }
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Success",
        description: "Booking deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      id: undefined,
      title: "",
      description: "",
      type: "",
      participants: [],
      startTime: "",
      endTime: "",
      meetingLink: "",
      notes: ""
    });
  };

  const handleEdit = (booking: Booking) => {
    setFormData({
      id: booking.id,
      title: booking.title,
      description: booking.description || "",
      type: booking.type,
      participants: booking.participants,
      startTime: format(new Date(booking.startTime), "yyyy-MM-dd'T'HH:mm"),
      endTime: format(new Date(booking.endTime), "yyyy-MM-dd'T'HH:mm"),
      meetingLink: booking.meetingLink || "",
      notes: booking.notes || ""
    });
    setIsEditDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.type || !formData.startTime || !formData.endTime || formData.participants.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (formData.id) {
      updateBookingMutation.mutate(formData);
    } else {
      createBookingMutation.mutate(formData);
    }
  };

  const handleParticipantToggle = (userId: number) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.includes(userId)
        ? prev.participants.filter(id => id !== userId)
        : [...prev.participants, userId]
    }));
  };

  const getFilteredUsers = () => {
    if (formData.type === "marketing_meeting") {
      return users.filter(user => 
        user.role === "staff" && MARKETING_SPECIALIZATIONS.includes(user.specialization || "") ||
        user.role === "project_manager" ||
        (user.role === "staff" && user.specialization === "product_owner")
      );
    }
    return users.filter(user => user.role !== "client");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "scheduled":
        return <Badge variant="default">Scheduled</Badge>;
      case "completed":
        return <Badge variant="secondary">Completed</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors = {
      one_on_one: "bg-blue-100 text-blue-800",
      team_booking: "bg-green-100 text-green-800", 
      marketing_meeting: "bg-purple-100 text-purple-800",
      general_booking: "bg-gray-100 text-gray-800"
    };

    return (
      <Badge className={colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {BOOKING_TYPES[type as keyof typeof BOOKING_TYPES] || type}
      </Badge>
    );
  };

  const isBookingUpcoming = (startTime: string) => {
    return new Date(startTime) > new Date();
  };

  const [location] = useLocation();

  if (bookingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col min-h-screen w-full min-w-0 lg:ml-64 xl:ml-72">
        <Header />
        <div className="flex-1 overflow-auto p-6 w-full space-y-6">
          <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bookings Management</h1>
          <p className="text-gray-600 mt-1">Schedule and manage team meetings</p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Schedule Meeting
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Schedule New Meeting</DialogTitle>
              <DialogDescription>
                Create a new meeting booking and invite participants
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Meeting Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter meeting title"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="type">Meeting Type *</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(value) => {
                      if (value === "general_booking") {
                        // Auto-select all staff members for general meetings
                        const allStaffIds = users
                          .filter(user => user.role === "staff" || user.role === "project_manager")
                          .map(user => user.id);
                        setFormData(prev => ({ ...prev, type: value, participants: allStaffIds }));
                      } else {
                        setFormData(prev => ({ ...prev, type: value, participants: [] }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select meeting type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(BOOKING_TYPES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Meeting description"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startTime">Start Time *</Label>
                  <Input
                    id="startTime"
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                    required
                    step="60"
                  />
                </div>

                <div>
                  <Label htmlFor="endTime">End Time *</Label>
                  <Input
                    id="endTime"
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                    required
                    step="60"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="meetingLink">Meeting Link</Label>
                <Input
                  id="meetingLink"
                  value={formData.meetingLink}
                  onChange={(e) => setFormData(prev => ({ ...prev, meetingLink: e.target.value }))}
                  placeholder="https://meet.google.com/..."
                />
              </div>

              <div>
                <Label>Participants *</Label>
                <div className="max-h-40 overflow-y-auto border rounded-md p-3 space-y-2">
                  {getFilteredUsers().map((user) => (
                    <div key={user.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`user-${user.id}`}
                        checked={formData.participants.includes(user.id)}
                        onCheckedChange={() => handleParticipantToggle(user.id)}
                      />
                      <label htmlFor={`user-${user.id}`} className="text-sm flex-1 cursor-pointer">
                        {user.name} ({user.role})
                        {user.specialization && (
                          <span className="text-gray-500 ml-1">- {user.specialization.replace('_', ' ')}</span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {formData.participants.length} participant(s) selected
                </p>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes"
                  rows={2}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createBookingMutation.isPending || updateBookingMutation.isPending}>
                  {formData.id 
                    ? (updateBookingMutation.isPending ? "Updating..." : "Update Meeting")
                    : (createBookingMutation.isPending ? "Creating..." : "Schedule Meeting")
                  }
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Meeting</DialogTitle>
              <DialogDescription>
                Update the meeting details and participants
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-title">Meeting Title *</Label>
                  <Input
                    id="edit-title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter meeting title"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="edit-type">Meeting Type *</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(value) => {
                      if (value === "general_booking") {
                        const allStaffIds = users
                          .filter(user => user.role === "staff" || user.role === "project_manager")
                          .map(user => user.id);
                        setFormData(prev => ({ ...prev, type: value, participants: allStaffIds }));
                      } else {
                        setFormData(prev => ({ ...prev, type: value, participants: [] }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select meeting type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(BOOKING_TYPES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Meeting description"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-startTime">Start Time *</Label>
                  <Input
                    id="edit-startTime"
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                    required
                    step="60"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-endTime">End Time *</Label>
                  <Input
                    id="edit-endTime"
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                    required
                    step="60"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-meetingLink">Meeting Link</Label>
                <Input
                  id="edit-meetingLink"
                  value={formData.meetingLink}
                  onChange={(e) => setFormData(prev => ({ ...prev, meetingLink: e.target.value }))}
                  placeholder="https://meet.google.com/..."
                />
              </div>

              <div>
                <Label>Participants *</Label>
                <div className="max-h-40 overflow-y-auto border rounded-md p-3 space-y-2">
                  {getFilteredUsers().map((user) => (
                    <div key={user.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-user-${user.id}`}
                        checked={formData.participants.includes(user.id)}
                        onCheckedChange={() => handleParticipantToggle(user.id)}
                      />
                      <label htmlFor={`edit-user-${user.id}`} className="text-sm flex-1 cursor-pointer">
                        {user.name} ({user.role})
                        {user.specialization && (
                          <span className="text-gray-500 ml-1">- {user.specialization.replace('_', ' ')}</span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {formData.participants.length} participant(s) selected
                </p>
              </div>

              <div>
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes"
                  rows={2}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateBookingMutation.isPending}>
                  {updateBookingMutation.isPending ? "Updating..." : "Update Meeting"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {warning && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {bookings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <Calendar className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings yet</h3>
              <p className="text-gray-500 text-center mb-4">
                Schedule your first meeting to get started
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Schedule Meeting
              </Button>
            </CardContent>
          </Card>
        ) : (
          bookings.map((booking: Booking) => (
            <Card key={booking.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{booking.title}</CardTitle>
                    <div className="flex items-center gap-2">
                      {getTypeBadge(booking.type)}
                      {getStatusBadge(booking.status)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isBookingUpcoming(booking.startTime) && booking.status === "scheduled" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(booking)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateBookingMutation.mutate({ id: booking.id, status: "cancelled" })}
                        >
                          Cancel
                        </Button>
                      </>
                    )}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the meeting booking.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteBookingMutation.mutate(booking.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {booking.description && (
                  <p className="text-gray-600">{booking.description}</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="font-medium">
                        {format(new Date(booking.startTime), "MMM d, yyyy")}
                      </p>
                      <p className="text-gray-500">
                        {booking.startTime.slice(11, 16)} - {booking.endTime.slice(11, 16)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <p>{booking.participants.length} participant(s)</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <p>By {booking.schedulerName}</p>
                  </div>
                </div>

                {booking.meetingLink && (
                  <div>
                    <a 
                      href={booking.meetingLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      Join Meeting
                    </a>
                  </div>
                )}

                {booking.notes && (
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-sm text-gray-700">{booking.notes}</p>
                  </div>
                )}

                {isBookingUpcoming(booking.startTime) && booking.status === "scheduled" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateBookingMutation.mutate({ id: booking.id, status: "completed" })}
                    >
                      Mark as Completed
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
        </div>
        </div>
      </div>
    </div>
  );
}