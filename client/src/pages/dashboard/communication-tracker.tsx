
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Eye, Flag, Trash2, FileText, Clock, MessageSquare, Calendar, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Project, User as UserType } from "@db/schema";

interface DelayedResponse {
  id: number;
  projectId: number;
  projectName: string;
  staffId: number;
  staffName: string;
  lastResponseTime: string;
  delayHours: number;
  status: 'pending' | 'investigated' | 'warned' | 'escalated' | 'discarded';
  projectManagerId: number;
  projectManagerName: string;
  createdAt: string;
  updatedAt: string;
}

interface CommunicationWarning {
  id: number;
  delayedResponseId: number;
  reason: string;
  advice: string;
  monetaryPenalty: number;
  staffId: number;
  sentBy: number;
  createdAt: string;
}

interface EscalationEntry {
  id: number;
  delayedResponseId: number;
  escalatedBy: number;
  escalatedAt: string;
  reportGenerated: boolean;
}

interface DiscardEntry {
  id: number;
  delayedResponseId: number;
  dateOfEntry: string;
  projectName: string;
  hoursLate: number;
  reason: string;
  discardedBy: number;
  createdAt: string;
}

export default function CommunicationTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // State for dialogs
  const [selectedDelay, setSelectedDelay] = useState<DelayedResponse | null>(null);
  const [isWarningDialogOpen, setIsWarningDialogOpen] = useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [isEscalationDialogOpen, setIsEscalationDialogOpen] = useState(false);

  // Form states
  const [warningForm, setWarningForm] = useState({
    reason: '',
    advice: '',
    monetaryPenalty: 0,
    staffId: 0
  });

  const [discardForm, setDiscardForm] = useState({
    dateOfEntry: new Date().toISOString().split('T')[0],
    projectName: '',
    hoursLate: 0,
    reason: ''
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('today');

  // Check if user is operations manager
  if (!user || (user.role !== "operations_manager" && user.specialization !== "operations_manager")) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard/communication-tracker" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 overflow-auto p-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
              <p className="text-gray-600 mt-2">This page is only available to operations managers.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fetch delayed responses
  const { data: delayedResponses = [] } = useQuery<DelayedResponse[]>({
    queryKey: ['/api/communication-tracker/delayed-responses', statusFilter, projectFilter, dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (projectFilter !== 'all') params.append('project', projectFilter);
      if (dateFilter !== 'all') params.append('date', dateFilter);
      
      const response = await fetch(`/api/communication-tracker/delayed-responses?${params}`);
      if (!response.ok) throw new Error('Failed to fetch delayed responses');
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch projects for filter
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    queryFn: async () => {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    }
  });

  // Fetch staff for warning form
  const { data: staff = [] } = useQuery<UserType[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    }
  });

  // Fetch daily report
  const { data: dailyReport } = useQuery({
    queryKey: ['/api/communication-tracker/daily-report', new Date().toISOString().split('T')[0]],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/communication-tracker/daily-report?date=${today}`);
      if (!response.ok) throw new Error('Failed to fetch daily report');
      return response.json();
    }
  });

  // Mutations
  const sendWarningMutation = useMutation({
    mutationFn: async (data: { delayedResponseId: number; reason: string; advice: string; monetaryPenalty: number; staffId: number }) => {
      const response = await fetch('/api/communication-tracker/send-warning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to send warning');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Warning sent successfully" });
      setIsWarningDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/communication-tracker/delayed-responses'] });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async (delayedResponseId: number) => {
      const response = await fetch('/api/communication-tracker/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayedResponseId }),
      });
      if (!response.ok) throw new Error('Failed to escalate');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Communication delay escalated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/communication-tracker/delayed-responses'] });
    },
  });

  const discardMutation = useMutation({
    mutationFn: async (data: { delayedResponseId: number; dateOfEntry: string; projectName: string; hoursLate: number; reason: string }) => {
      const response = await fetch('/api/communication-tracker/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to discard');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Communication query discarded successfully" });
      setIsDiscardDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/communication-tracker/delayed-responses'] });
    },
  });

  const handleInvestigate = (delay: DelayedResponse) => {
    // Navigate to project team chat
    setLocation(`/dashboard/projects/${delay.projectId}/team-chat`);
  };

  const handleWarning = (delay: DelayedResponse) => {
    setSelectedDelay(delay);
    setWarningForm({
      reason: '',
      advice: '',
      monetaryPenalty: 0,
      staffId: delay.staffId
    });
    setIsWarningDialogOpen(true);
  };

  const handleDiscard = (delay: DelayedResponse) => {
    setSelectedDelay(delay);
    setDiscardForm({
      dateOfEntry: new Date().toISOString().split('T')[0],
      projectName: delay.projectName,
      hoursLate: delay.delayHours,
      reason: ''
    });
    setIsDiscardDialogOpen(true);
  };

  const handleEscalate = (delay: DelayedResponse) => {
    escalateMutation.mutate(delay.id);
  };

  const submitWarning = () => {
    if (!selectedDelay) return;
    sendWarningMutation.mutate({
      delayedResponseId: selectedDelay.id,
      ...warningForm
    });
  };

  const submitDiscard = () => {
    if (!selectedDelay) return;
    discardMutation.mutate({
      delayedResponseId: selectedDelay.id,
      ...discardForm
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'investigated': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'warned': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'escalated': return 'bg-red-100 text-red-800 border-red-300';
      case 'discarded': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getDelayColor = (hours: number) => {
    if (hours < 2) return 'text-yellow-600';
    if (hours < 6) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath="/dashboard/communication-tracker" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <MessageSquare className="h-6 w-6" />
                  Communication Tracker
                </h1>
                <p className="text-muted-foreground">Monitor team chat response delays and take action</p>
              </div>
            </div>

            <Tabs defaultValue="tracker" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tracker">Response Tracker</TabsTrigger>
                <TabsTrigger value="reports">Daily Reports</TabsTrigger>
              </TabsList>

              <TabsContent value="tracker" className="space-y-6">
                {/* Filters */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <Label htmlFor="status-filter">Status</Label>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger id="status-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="investigated">Investigated</SelectItem>
                            <SelectItem value="warned">Warned</SelectItem>
                            <SelectItem value="escalated">Escalated</SelectItem>
                            <SelectItem value="discarded">Discarded</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="project-filter">Project</Label>
                        <Select value={projectFilter} onValueChange={setProjectFilter}>
                          <SelectTrigger id="project-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Projects</SelectItem>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={project.id.toString()}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="date-filter">Date Range</Label>
                        <Select value={dateFilter} onValueChange={setDateFilter}>
                          <SelectTrigger id="date-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="week">This Week</SelectItem>
                            <SelectItem value="month">This Month</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-end">
                        <Button 
                          variant="outline" 
                          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/communication-tracker/delayed-responses'] })}
                          className="w-full"
                        >
                          Refresh
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Delayed Responses List */}
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-semibold">Delayed Responses ({delayedResponses.length})</h2>
                      <Badge variant="outline" className="text-sm">
                        <Clock className="h-3 w-3 mr-1" />
                        Auto-refreshes every minute
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {delayedResponses.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No delayed responses found</p>
                        <p className="text-sm">All team communications are on time!</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {delayedResponses.map((delay) => (
                          <div key={delay.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-medium">{delay.projectName}</h3>
                                  <Badge className={getStatusColor(delay.status)}>
                                    {delay.status}
                                  </Badge>
                                  <Badge variant="outline" className={getDelayColor(delay.delayHours)}>
                                    <Clock className="h-3 w-3 mr-1" />
                                    {delay.delayHours}h delayed
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  <p><User className="inline h-3 w-3 mr-1" /><strong>Staff:</strong> {delay.staffName}</p>
                                  <p><User className="inline h-3 w-3 mr-1" /><strong>PM:</strong> {delay.projectManagerName}</p>
                                  <p><Clock className="inline h-3 w-3 mr-1" /><strong>Last Response:</strong> {new Date(delay.lastResponseTime).toLocaleString()}</p>
                                </div>
                              </div>
                              <div className="flex gap-2 ml-4">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleInvestigate(delay)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {delay.status === 'pending' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleWarning(delay)}
                                    >
                                      <AlertTriangle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDiscard(delay)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEscalate(delay)}
                                  disabled={delay.status === 'escalated'}
                                >
                                  <Flag className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="reports" className="space-y-6">
                {/* Daily Report */}
                <Card>
                  <CardHeader>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Daily Communication Report
                    </h2>
                  </CardHeader>
                  <CardContent>
                    {dailyReport ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <h3 className="font-medium text-red-700">Total Delayed Responses</h3>
                            <p className="text-2xl font-bold text-red-800">{dailyReport.totalDelayed}</p>
                          </div>
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                            <h3 className="font-medium text-orange-700">Warnings Sent</h3>
                            <p className="text-2xl font-bold text-orange-800">{dailyReport.warningsSent}</p>
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="font-medium text-blue-700">Cases Escalated</h3>
                            <p className="text-2xl font-bold text-blue-800">{dailyReport.escalated}</p>
                          </div>
                        </div>
                        
                        {dailyReport.delayedByProject && dailyReport.delayedByProject.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2">Delays by Project</h4>
                            <div className="space-y-2">
                              {dailyReport.delayedByProject.map((project: any, index: number) => (
                                <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                  <span>{project.projectName}</span>
                                  <Badge variant="secondary">{project.count} delays</Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No report data available for today</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Warning Dialog */}
            <Dialog open={isWarningDialogOpen} onOpenChange={setIsWarningDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Send Warning</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="reason">Reason for Warning</Label>
                    <Textarea
                      id="reason"
                      value={warningForm.reason}
                      onChange={(e) => setWarningForm({...warningForm, reason: e.target.value})}
                      placeholder="Explain why this warning is being issued..."
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="advice">Advice/Suggestion</Label>
                    <Textarea
                      id="advice"
                      value={warningForm.advice}
                      onChange={(e) => setWarningForm({...warningForm, advice: e.target.value})}
                      placeholder="Provide advice or suggestions for improvement..."
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="penalty">Monetary Penalty Fee ($)</Label>
                    <Input
                      id="penalty"
                      type="number"
                      min="0"
                      step="0.01"
                      value={warningForm.monetaryPenalty}
                      onChange={(e) => setWarningForm({...warningForm, monetaryPenalty: parseFloat(e.target.value)})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="staff">Select Staff</Label>
                    <Select value={warningForm.staffId.toString()} onValueChange={(value) => setWarningForm({...warningForm, staffId: parseInt(value)})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.filter(s => s.role === 'staff' || s.role === 'project_manager').map((staffMember) => (
                          <SelectItem key={staffMember.id} value={staffMember.id.toString()}>
                            {staffMember.name} ({staffMember.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsWarningDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={submitWarning}
                      disabled={!warningForm.reason || !warningForm.advice || !warningForm.staffId}
                    >
                      Send Warning
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Discard Dialog */}
            <Dialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Discard Communication Query</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="discard-date">Date of Entry</Label>
                    <Input
                      id="discard-date"
                      type="date"
                      value={discardForm.dateOfEntry}
                      onChange={(e) => setDiscardForm({...discardForm, dateOfEntry: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="discard-project">Project</Label>
                    <Input
                      id="discard-project"
                      value={discardForm.projectName}
                      onChange={(e) => setDiscardForm({...discardForm, projectName: e.target.value})}
                      readOnly
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="discard-hours">Hours Late</Label>
                    <Input
                      id="discard-hours"
                      type="number"
                      value={discardForm.hoursLate}
                      onChange={(e) => setDiscardForm({...discardForm, hoursLate: parseFloat(e.target.value)})}
                      readOnly
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="discard-reason">Why Operations Manager is Discarding</Label>
                    <Textarea
                      id="discard-reason"
                      value={discardForm.reason}
                      onChange={(e) => setDiscardForm({...discardForm, reason: e.target.value})}
                      placeholder="Explain why this communication query is being discarded..."
                    />
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsDiscardDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={submitDiscard}
                      disabled={!discardForm.reason}
                    >
                      Discard Query
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
