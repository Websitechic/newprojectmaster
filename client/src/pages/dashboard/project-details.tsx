import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClipboardList, MessageSquare, Users, FileText, Calendar, Plus, Edit } from "lucide-react";
import { ProjectPlanForm } from "@/components/project/project-plan-form";
import type { Project, ProjectPlan } from "@db/schema";
import { useAuth } from "@/hooks/use-auth";

export default function ProjectDetails() {
  const { id } = useParams();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<(ProjectPlan & { deliverables?: any[] }) | null>(null);

  const isProjectManager = user?.role === "project_manager";

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["api/projects", id],
    queryFn: () => fetch(`/api/projects/${id}`).then(res => res.json())
  });

  const { data: projectPlans } = useQuery({
    queryKey: [`/api/projects/${id}/plans`],
    queryFn: () => fetch(`/api/projects/${id}/plans`).then(res => res.json()),
    enabled: !!id,
  });

  if (isLoading || !project) {
    return <div>Loading...</div>;
  }

  const cards = [
    {
      title: "Tasks",
      icon: ClipboardList,
      description: "Manage and track project tasks in Kanban view",
      path: `/dashboard/projects/${id}/tasks`
    },
    {
      title: "Team Chat",
      icon: MessageSquare,
      description: "Internal communication between team members",
      path: `/dashboard/projects/${id}/team-chat`
    },
    {
      title: "Client Communication",
      icon: Users,
      description: "Direct communication channel with the client",
      path: `/dashboard/projects/${id}/client-chat`
    },
    {
      title: "Resources",
      icon: FileText,
      description: "Project documents and important files",
      path: `/dashboard/projects/${id}/resources`
    }
  ];

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground">{project.description}</p>
          </div>

          {/* Project Plans Section */}
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Project Plans</h2>
                    <p className="text-sm text-muted-foreground">
                      Detailed project plans with deliverables and timelines
                    </p>
                  </div>
                  {isProjectManager && (
                    <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Plan
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>
                            {editingPlan ? "Edit Project Plan" : "Create Project Plan"}
                          </DialogTitle>
                        </DialogHeader>
                        <ProjectPlanForm
                          projectId={parseInt(id!)}
                          plan={editingPlan || undefined}
                          onSuccess={() => {
                            setIsPlanDialogOpen(false);
                            setEditingPlan(null);
                          }}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {projectPlans && projectPlans.length > 0 ? (
                  <div className="space-y-4">
                    {projectPlans.map((plan: any) => (
                      <div key={plan.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold">{plan.name}</h3>
                            <Badge variant={
                              plan.status === 'active' ? 'default' :
                              plan.status === 'completed' ? 'secondary' :
                              plan.status === 'on_hold' ? 'destructive' : 'outline'
                            }>
                              {plan.status}
                            </Badge>
                          </div>
                          {isProjectManager && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingPlan(plan);
                                setIsPlanDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                          )}
                        </div>
                        
                        {plan.description && (
                          <p className="text-sm text-muted-foreground mb-3">{plan.description}</p>
                        )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Timeline:</span>
                            <p className="text-muted-foreground">
                              {plan.startDate ? new Date(plan.startDate).toLocaleDateString() : 'TBD'} - 
                              {plan.endDate ? new Date(plan.endDate).toLocaleDateString() : 'TBD'}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium">Duration:</span>
                            <p className="text-muted-foreground">
                              {plan.startDate && plan.endDate 
                                ? Math.ceil((new Date(plan.endDate).getTime() - new Date(plan.startDate).getTime()) / (1000 * 3600 * 24)) + ' days'
                                : 'TBD'
                              }
                            </p>
                          </div>
                          <div>
                            <span className="font-medium">Created:</span>
                            <p className="text-muted-foreground">
                              {new Date(plan.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        
                        <Button
                          variant="link"
                          className="mt-3 p-0 h-auto"
                          onClick={() => setLocation(`/dashboard/projects/${id}/plan/${plan.id}`)}
                        >
                          View Deliverables →
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-2">No Project Plans</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {isProjectManager 
                        ? "Create your first project plan to organize deliverables and timelines."
                        : "No project plans have been created yet."
                      }
                    </p>
                    {isProjectManager && (
                      <Button onClick={() => setIsPlanDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Plan
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card 
                  key={card.title}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setLocation(card.path)}
                >
                  <CardHeader className="flex flex-row items-center gap-4">
                    <Icon className="h-6 w-6" />
                    <div>
                      <h3 className="text-lg font-semibold">{card.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {card.description}
                      </p>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}