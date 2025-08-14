import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Send, User, AlertTriangle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StaffQuery {
  id: number;
  staffId: number;
  staffName: string;
  staffNameFull?: string;
  department: string;
  staffUniqueValue: string;
  reason: string;
  whyQuery: string;
  attachmentPath?: string;
  likelyPenalty: string;
  additionalNote?: string;
  sentBy: number;
  senderName?: string;
  status: "pending" | "acknowledged" | "resolved";
  createdAt: string;
  updatedAt: string;
}

export default function StaffQueries() {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // Fetch all users for staff selection
  const { data: allUsers = [] } = useQuery({
    queryKey: ["/api/users/all"],
    enabled: user?.role === "operations_manager" || user?.specialization === "operations_manager",
  });

  // Fetch all departments for department selection
  const { data: departments = [] } = useQuery({
    queryKey: ["/api/departments"],
    enabled: user?.role === "operations_manager" || user?.specialization === "operations_manager",
  });

  // Fetch staff queries
  const { data: staffQueries = [], isLoading } = useQuery({
    queryKey: ["/api/staff-queries"],
    refetchInterval: 30000,
  });

  // Form state
  const [formData, setFormData] = useState({
    staffId: "",
    staffName: "",
    department: "",
    staffUniqueValue: "",
    reason: "",
    whyQuery: "",
    attachmentFile: null as File | null,
    likelyPenalty: "",
    additionalNote: "",
  });

  // Create staff query mutation
  const createQueryMutation = useMutation({
    mutationFn: async (queryData: any) => {
      const formData = new FormData();
      Object.entries(queryData).forEach(([key, value]) => {
        if (key === 'attachmentFile' && value) {
          formData.append('attachment', value as File);
        } else if (value !== null && value !== undefined && key !== 'attachmentFile') {
          formData.append(key, value.toString());
        }
      });

      const response = await fetch("/api/staff-queries", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to create staff query");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Staff query sent successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-queries"] });
      setShowForm(false);
      setFormData({
        staffId: "",
        staffName: "",
        department: "",
        staffUniqueValue: "",
        reason: "",
        whyQuery: "",
        attachmentFile: null,
        likelyPenalty: "",
        additionalNote: "",
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send staff query",
        variant: "destructive" 
      });
    },
  });

  // Update query status mutation (for staff members)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await fetch(`/api/staff-queries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update query status");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Query status updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-queries"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update query status",
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.staffId || !formData.staffName || !formData.department || !formData.staffUniqueValue || 
        !formData.reason || !formData.whyQuery || !formData.likelyPenalty) {
      toast({ 
        title: "Error", 
        description: "Please fill in all required fields",
        variant: "destructive" 
      });
      return;
    }

    createQueryMutation.mutate({
      ...formData,
      staffId: parseInt(formData.staffId),
    });
  };

  const handleStaffSelect = (staffId: string) => {
    const selectedStaff = allUsers.find((u: any) => u.id.toString() === staffId);
    if (selectedStaff) {
      setFormData(prev => ({
        ...prev,
        staffId: staffId,
        staffName: selectedStaff.name,
        department: selectedStaff.specialization || selectedStaff.role || "",
      }));
    }
  };

  const getReasonLabel = (reason: string) => {
    const reasonMap: Record<string, string> = {
      "wrongly_using_work_app": "Wrongly using the work app",
      "substandard_delivery": "Substandard delivery",
      "repeatedly_missed_deadlines": "Repeatedly 3 times in a week missed task deadline",
      "disrespectful_communication": "Disrespectful communication manner to co worker",
      "disregard_company_policy": "Disregard of the company policy"
    };
    return reasonMap[reason] || reason;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "acknowledged": return "bg-blue-100 text-blue-800";
      case "resolved": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const isOperationsManager = user?.role === "operations_manager" || user?.specialization === "operations_manager";

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading staff queries...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isOperationsManager ? "Staff Queries Management" : "My Queries"}
          </h1>
          <p className="text-gray-600">
            {isOperationsManager 
              ? "Send and manage staff queries and disciplinary actions"
              : "View queries and disciplinary actions sent to you"
            }
          </p>
        </div>
        {isOperationsManager && (
          <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
            <Send size={16} />
            Send New Query
          </Button>
        )}
      </div>

      {/* Create Query Form */}
      {showForm && isOperationsManager && (
        <Card>
          <CardHeader>
            <CardTitle>Send Staff Query</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="staffId">Staff Name *</Label>
                  <Select onValueChange={handleStaffSelect} value={formData.staffId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers.map((staff: any) => (
                        <SelectItem key={staff.id} value={staff.id.toString()}>
                          {staff.name} ({staff.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="department">Department *</Label>
                  <Select onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))} value={formData.department}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept: string) => (
                        <SelectItem key={dept} value={dept}>
                          {dept.charAt(0).toUpperCase() + dept.slice(1).replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="staffUniqueValue">Staff 3 Unique Value *</Label>
                  <Input
                    id="staffUniqueValue"
                    value={formData.staffUniqueValue}
                    onChange={(e) => setFormData(prev => ({ ...prev, staffUniqueValue: e.target.value }))}
                    placeholder="Staff unique identifier"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="reason">Reason for Query *</Label>
                  <Select onValueChange={(value) => setFormData(prev => ({ ...prev, reason: value }))} value={formData.reason}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wrongly_using_work_app">Wrongly using the work app</SelectItem>
                      <SelectItem value="substandard_delivery">Substandard delivery</SelectItem>
                      <SelectItem value="repeatedly_missed_deadlines">Repeatedly 3 times in a week missed task deadline</SelectItem>
                      <SelectItem value="disrespectful_communication">Disrespectful communication manner to co worker</SelectItem>
                      <SelectItem value="disregard_company_policy">Disregard of the company policy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="whyQuery">Why Query *</Label>
                <Textarea
                  id="whyQuery"
                  value={formData.whyQuery}
                  onChange={(e) => setFormData(prev => ({ ...prev, whyQuery: e.target.value }))}
                  placeholder="Explain why this query is being issued..."
                  rows={3}
                  required
                />
              </div>

              <div>
                <Label htmlFor="attachment">Attach Report/Proof</Label>
                <Input
                  id="attachment"
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setFormData(prev => ({ ...prev, attachmentFile: file }));
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Accepted formats: Images, PDF, Word documents (max 10MB)
                </p>
              </div>

              <div>
                <Label htmlFor="likelyPenalty">Likely Penalty if This Occurs Again *</Label>
                <Textarea
                  id="likelyPenalty"
                  value={formData.likelyPenalty}
                  onChange={(e) => setFormData(prev => ({ ...prev, likelyPenalty: e.target.value }))}
                  placeholder="Describe the potential consequences..."
                  rows={3}
                  required
                />
              </div>

              <div>
                <Label htmlFor="additionalNote">Additional Note</Label>
                <Textarea
                  id="additionalNote"
                  value={formData.additionalNote}
                  onChange={(e) => setFormData(prev => ({ ...prev, additionalNote: e.target.value }))}
                  placeholder="Any additional comments or information..."
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={createQueryMutation.isPending}>
                  {createQueryMutation.isPending ? "Sending..." : "Send Query"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Queries List */}
      <div className="space-y-4">
        {staffQueries.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {isOperationsManager ? "No queries sent" : "No queries received"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {isOperationsManager 
                  ? "You haven't sent any staff queries yet."
                  : "You don't have any queries from operations management."
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          staffQueries.map((query: StaffQuery) => (
            <Card key={query.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <User size={16} />
                      <span className="font-medium">
                        {isOperationsManager ? query.staffNameFull || query.staffName : query.staffName}
                      </span>
                    </div>
                    <Badge className={getStatusColor(query.status)}>
                      {query.status.charAt(0).toUpperCase() + query.status.slice(1)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock size={14} />
                    {new Date(query.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Department: {query.department}</span>
                  <Separator orientation="vertical" className="h-4" />
                  <span>ID: {query.staffUniqueValue}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-red-600" />
                    <span className="font-medium text-red-600">Reason:</span>
                  </div>
                  <p className="text-sm bg-red-50 p-3 rounded-md">
                    {getReasonLabel(query.reason)}
                  </p>
                </div>

                <div>
                  <span className="font-medium">Why Query:</span>
                  <p className="text-sm text-gray-700 mt-1">{query.whyQuery}</p>
                </div>

                {query.attachmentPath && (
                  <div>
                    <span className="font-medium">Attachment:</span>
                    <p className="text-sm text-blue-600 mt-1">{query.attachmentPath}</p>
                  </div>
                )}

                <div>
                  <span className="font-medium">Likely Penalty if This Occurs Again:</span>
                  <p className="text-sm text-gray-700 mt-1 bg-yellow-50 p-3 rounded-md">
                    {query.likelyPenalty}
                  </p>
                </div>

                {query.additionalNote && (
                  <div>
                    <span className="font-medium">Additional Note:</span>
                    <p className="text-sm text-gray-700 mt-1">{query.additionalNote}</p>
                  </div>
                )}

                {!isOperationsManager && query.status === "pending" && (
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      size="sm"
                      onClick={() => updateStatusMutation.mutate({ id: query.id, status: "acknowledged" })}
                      disabled={updateStatusMutation.isPending}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate({ id: query.id, status: "resolved" })}
                      disabled={updateStatusMutation.isPending}
                    >
                      Mark as Resolved
                    </Button>
                  </div>
                )}

                {isOperationsManager && (
                  <div className="text-xs text-gray-500 pt-2 border-t">
                    Sent by: {query.senderName || "Operations Manager"}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}