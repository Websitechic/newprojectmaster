
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Calendar, Clock, User, Edit } from "lucide-react";
import { ProjectPlanForm } from "@/components/project/project-plan-form";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function ProjectPlanDetails() {
  const { id: projectId, planId } = useParams();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const isProjectManager = user?.role === "project_manager";

  const { data: project } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: () => fetch(`/api/projects/${projectId}`).then(res => res.json()),
  });

  const { data: planData, isLoading } = useQuery({
    queryKey: [`/api/project-plans/${planId}`],
    queryFn: () => fetch(`/api/project-plans/${planId}`).then(res => res.json()),
  });

  const updateDeliverableStatus = useMutation({
    mutationFn: async ({ deliverableId, status }: { deliverableId: number; status: string }) => {
      const response = await fetch(`/api/deliverables/${deliverableId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Failed to update deliverable status");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/project-plans/${planId}`] });
      toast({
        title: "Success",
        description: "Deliverable status updated successfully!",
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

  if (isLoading || !planData) {
    return <div>Loading...</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500';
      case 'overdue': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'secondary';
      case 'in_progress': return 'default';
      case 'overdue': return 'destructive';
      default: return 'outline';
    }
  };

  const completedDeliverables = planData.deliverables?.filter((d: any) => d.status === 'completed').length || 0;
  const totalDeliverables = planData.deliverables?.length || 0;
  const progressPercentage = totalDeliverables > 0 ? (completedDeliverables / totalDeliverables) * 100 : 0;

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${projectId}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setLocation(`/dashboard/projects/${projectId}`)}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Project
            </Button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{planData.name}</h1>
                <p className="text-muted-foreground">
                  {project?.name} - Project Plan Details
                </p>
              </div>
              {isProjectManager && (
                <Button onClick={() => setIsEditDialogOpen(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Plan
                </Button>
              )}
            </div>
          </div>

          {/* Plan Overview */}
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Plan Overview</h2>
                  <Badge variant={getStatusVariant(planData.status)}>
                    {planData.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm">Timeline</h3>
                    <div className="text-sm text-muted-foreground">
                      <p><span className="font-medium">Start:</span> {planData.startDate ? new Date(planData.startDate).toLocaleDateString() : 'TBD'}</p>
                      <p><span className="font-medium">End:</span> {planData.endDate ? new Date(planData.endDate).toLocaleDateString() : 'TBD'}</p>
                      <p><span className="font-medium">Duration:</span> {
                        planData.startDate && planData.endDate 
                          ? Math.ceil((new Date(planData.endDate).getTime() - new Date(planData.startDate).getTime()) / (1000 * 3600 * 24)) + ' days'
                          : 'TBD'
                      }</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm">Progress</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Completed Deliverables</span>
                        <span>{completedDeliverables}/{totalDeliverables}</span>
                      </div>
                      <Progress value={progressPercentage} className="w-full" />
                      <p className="text-xs text-muted-foreground">
                        {Math.round(progressPercentage)}% complete
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-medium text-sm">Details</h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><span className="font-medium">Created:</span> {new Date(planData.createdAt).toLocaleDateString()}</p>
                      <p><span className="font-medium">Last Updated:</span> {new Date(planData.updatedAt).toLocaleDateString()}</p>
                      <p><span className="font-medium">Total Deliverables:</span> {totalDeliverables}</p>
                    </div>
                  </div>
                </div>

                {planData.description && (
                  <div className="mt-6 pt-4 border-t">
                    <h3 className="font-medium text-sm mb-2">Description</h3>
                    <p className="text-sm text-muted-foreground">{planData.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Deliverables */}
          <div className="mb-8">
            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold">Deliverables</h2>
                <p className="text-sm text-muted-foreground">
                  Track progress and manage deliverable timelines
                </p>
              </CardHeader>
              <CardContent>
                {planData.deliverables && planData.deliverables.length > 0 ? (
                  <div className="space-y-4">
                    {planData.deliverables.map((deliverable: any, index: number) => {
                      const isOverdue = new Date(deliverable.endDate) < new Date() && deliverable.status !== 'completed';
                      const actualStatus = isOverdue && deliverable.status !== 'completed' ? 'overdue' : deliverable.status;
                      
                      return (
                        <div key={deliverable.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className={`w-3 h-3 rounded-full ${getStatusColor(actualStatus)}`}></div>
                                <h3 className="font-semibold">{deliverable.name}</h3>
                                <Badge variant={getStatusVariant(actualStatus)}>
                                  {actualStatus.replace('_', ' ')}
                                </Badge>
                              </div>
                              {deliverable.description && (
                                <p className="text-sm text-muted-foreground mb-3">{deliverable.description}</p>
                              )}
                            </div>
                            {isProjectManager && (
                              <div className="ml-4">
                                <select
                                  value={deliverable.status}
                                  onChange={(e) => updateDeliverableStatus.mutate({ 
                                    deliverableId: deliverable.id, 
                                    status: e.target.value 
                                  })}
                                  className="text-sm border rounded px-2 py-1"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="completed">Completed</option>
                                </select>
                              </div>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <span className="font-medium">Start:</span>
                                <p className="text-muted-foreground">{new Date(deliverable.startDate).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <span className="font-medium">End:</span>
                                <p className="text-muted-foreground">{new Date(deliverable.endDate).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <span className="font-medium">Duration:</span>
                                <p className="text-muted-foreground">{deliverable.duration} days</p>
                              </div>
                            </div>
                            {deliverable.assigneeId && (
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <span className="font-medium">Assignee:</span>
                                  <p className="text-muted-foreground">Assigned</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-2">No Deliverables</h3>
                    <p className="text-sm text-muted-foreground">
                      No deliverables have been defined for this plan yet.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Edit Plan Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Project Plan</DialogTitle>
              </DialogHeader>
              <ProjectPlanForm
                projectId={parseInt(projectId!)}
                plan={planData}
                onSuccess={() => setIsEditDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
