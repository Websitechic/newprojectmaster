
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, AlertTriangle, Plus, Edit, Trash2, FileText, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  specialization?: string;
}

interface Memo {
  id: number;
  title: string;
  content: string;
  type: string;
  recipients: any[];
  sentBy: number;
  createdAt: string;
  senderName: string;
  reads?: MemoRead[];
  readCount?: number;
  isRead?: boolean;
  readAt?: string;
}

interface MemoRead {
  userId: number;
  readAt: string;
  userName: string;
}

const MEMO_TYPES = {
  individual: "Individual",
  staff_members: "Staff Members",
  department: "Department"
};

const DEPARTMENTS = [
  { value: "all_staff", label: "All Staff" },
  { value: "project_managers", label: "Project Managers" },
  { value: "product_owners", label: "Product Owners" },
  { value: "automation", label: "Automation Team" },
  { value: "copywriting", label: "Copywriting Team" },
  { value: "design", label: "Design Team" },
  { value: "media_buying", label: "Media Buying Team" },
  { value: "development", label: "Development Team" },
  { value: "community_manager", label: "Community Management Team" },
  { value: "technical_support", label: "Technical Support Team" },
];

export default function Memos() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    type: "",
    recipients: [] as any[],
  });

  const isOperationsManager = user?.role === "operations_manager" || user?.specialization === "operations_manager";

  // Fetch memos (operations managers see all, others see their own)
  const { data: memos = [], isLoading: memosLoading } = useQuery({
    queryKey: isOperationsManager ? ["/api/memos"] : ["/api/memos/my-memos"],
  });

  // Fetch all users for individual/staff member selection
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isOperationsManager,
  });

  // Create memo mutation
  const createMemoMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create memo");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Memo sent successfully",
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

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (memoId: number) => {
      const response = await fetch(`/api/memos/${memoId}/mark-read`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to mark memo as read");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memos/my-memos"] });
    },
  });

  // Delete memo mutation
  const deleteMemoMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/memos/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete memo");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      toast({
        title: "Success",
        description: "Memo deleted successfully",
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
      title: "",
      content: "",
      type: "",
      recipients: [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.content || !formData.type || formData.recipients.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createMemoMutation.mutate(formData);
  };

  const handleRecipientToggle = (recipientId: any) => {
    setFormData(prev => ({
      ...prev,
      recipients: prev.recipients.includes(recipientId)
        ? prev.recipients.filter(id => id !== recipientId)
        : [...prev.recipients, recipientId]
    }));
  };

  const getFilteredRecipients = () => {
    if (formData.type === "department") {
      return DEPARTMENTS;
    }
    return users.filter(u => u.role !== "client");
  };

  const getTypeBadge = (type: string) => {
    const colors = {
      individual: "bg-blue-100 text-blue-800",
      staff_members: "bg-green-100 text-green-800", 
      department: "bg-purple-100 text-purple-800"
    };

    return (
      <Badge className={colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {MEMO_TYPES[type as keyof typeof MEMO_TYPES] || type}
      </Badge>
    );
  };

  const handleViewMemo = (memo: Memo) => {
    setSelectedMemo(memo);
    setIsViewDialogOpen(true);
    
    // Mark as read if user is not operations manager and memo is unread
    if (!isOperationsManager && !memo.isRead) {
      markAsReadMutation.mutate(memo.id);
    }
  };

  if (memosLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="h-8 w-8 text-blue-600" />
                  Memos
                </h1>
                <p className="text-gray-600 mt-1">
                  {isOperationsManager ? "Send and manage organizational memos" : "View memos sent to you"}
                </p>
              </div>

              {isOperationsManager && (
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={resetForm}>
                      <Plus className="w-4 h-4 mr-2" />
                      Send Memo
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Send New Memo</DialogTitle>
                      <DialogDescription>
                        Create and send a memo to individuals, staff members, or departments
                      </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <Label htmlFor="title">Memo Title *</Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="Enter memo title"
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="content">Memo Content *</Label>
                        <Textarea
                          id="content"
                          value={formData.content}
                          onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                          placeholder="Enter memo content"
                          rows={6}
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="type">Recipient Type *</Label>
                        <Select 
                          value={formData.type} 
                          onValueChange={(value) => {
                            setFormData(prev => ({ ...prev, type: value, recipients: [] }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select recipient type" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(MEMO_TYPES).map(([key, label]) => (
                              <SelectItem key={key} value={key}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.type && (
                        <div>
                          <Label>Recipients *</Label>
                          <div className="max-h-40 overflow-y-auto border rounded-md p-3 space-y-2">
                            {getFilteredRecipients().map((recipient: any) => (
                              <div key={recipient.id || recipient.value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`recipient-${recipient.id || recipient.value}`}
                                  checked={formData.recipients.includes(recipient.id || recipient.value)}
                                  onCheckedChange={() => handleRecipientToggle(recipient.id || recipient.value)}
                                />
                                <label htmlFor={`recipient-${recipient.id || recipient.value}`} className="text-sm flex-1 cursor-pointer">
                                  {recipient.name || recipient.label}
                                  {recipient.role && (
                                    <span className="text-gray-500 ml-1">({recipient.role})</span>
                                  )}
                                </label>
                              </div>
                            ))}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {formData.recipients.length} recipient(s) selected
                          </p>
                        </div>
                      )}

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createMemoMutation.isPending}>
                          {createMemoMutation.isPending ? "Sending..." : "Send Memo"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <div className="grid gap-6">
              {memos.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-10">
                    <FileText className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {isOperationsManager ? "No memos created yet" : "No memos received"}
                    </h3>
                    <p className="text-gray-500 text-center mb-4">
                      {isOperationsManager 
                        ? "Send your first memo to get started" 
                        : "You'll see memos sent to you here"
                      }
                    </p>
                    {isOperationsManager && (
                      <Button onClick={() => setIsCreateDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Send First Memo
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                memos.map((memo: Memo) => (
                  <Card key={memo.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xl">{memo.title}</CardTitle>
                            {!isOperationsManager && !memo.isRead && (
                              <Badge variant="destructive" className="text-xs">New</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {getTypeBadge(memo.type)}
                            <Badge variant="outline" className="text-xs">
                              From: {memo.senderName}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewMemo(memo)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>

                          {isOperationsManager && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteMemoMutation.mutate(memo.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <p className="text-gray-600 line-clamp-3">{memo.content}</p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <p className="text-gray-500">
                            {format(new Date(memo.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>

                        {isOperationsManager && memo.readCount !== undefined && (
                          <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-gray-400" />
                            <p className="text-gray-500">{memo.readCount} read</p>
                          </div>
                        )}

                        {!isOperationsManager && memo.readAt && (
                          <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-green-400" />
                            <p className="text-green-600 text-xs">
                              Read on {format(new Date(memo.readAt), "MMM d, yyyy")}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* View Memo Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {selectedMemo?.title}
            </DialogTitle>
            <DialogDescription>
              From: {selectedMemo?.senderName} • {selectedMemo && format(new Date(selectedMemo.createdAt), "MMM d, yyyy 'at' h:mm a")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              {selectedMemo && getTypeBadge(selectedMemo.type)}
            </div>

            <div className="prose max-w-none">
              <div className="whitespace-pre-wrap text-gray-700">
                {selectedMemo?.content}
              </div>
            </div>

            {isOperationsManager && selectedMemo?.reads && selectedMemo.reads.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Read by:</h4>
                <div className="space-y-1">
                  {selectedMemo.reads.map((read, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>{read.userName}</span>
                      <span className="text-gray-500">
                        {format(new Date(read.readAt), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
