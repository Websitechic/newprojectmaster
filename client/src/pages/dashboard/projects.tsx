import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { useLocation } from "wouter";
import { ProjectCard } from "@/components/project/project-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ProjectForm } from "@/components/project/project-form";
import type { Project } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Projects() {
  const [location] = useLocation();
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const filteredProjects = projects?.filter(project => {
    // Apply status filter first
    if (filter !== "all" && project.status !== filter) return false;

    // Apply dashboard card filters
    if (statusFilter === "overdue") {
      const now = new Date();
      const endDate = new Date(project.endDate || '');
      return endDate < now && project.status !== 'completed';
    }

    if (statusFilter === "completed_week") {
      if (project.status !== 'completed') return false;
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const updatedDate = new Date(project.updatedAt || '');
      return updatedDate >= weekAgo;
    }

    if (statusFilter === "urgent") {
      if (project.status === 'completed') return false;
      const tenWorkingDaysAgo = new Date();
      tenWorkingDaysAgo.setDate(tenWorkingDaysAgo.getDate() - 14);
      const lastUpdate = new Date(project.updatedAt || '');
      return lastUpdate < tenWorkingDaysAgo;
    }

    return true;
  });

  // Set of expanded categories (initially all collapsed)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Group projects by category
  const projectsByCategory = useMemo(() => {
    if (!filteredProjects) return {};

    // Define category display names
    const categoryDisplayNames: Record<string, string> = {
      'website_development': 'Website Development',
      'dpl_outright': 'DPL Outright',
      'dpl_partnership': 'DPL Partnership',
      'direct_marketing': 'Direct Marketing',
      'support_maintenance': 'Support & Maintenance',
      'uncategorized': 'Uncategorized',
    };

    // Group projects
    const groupedProjects: Record<string, { displayName: string, projects: Project[] }> = {};

    filteredProjects.forEach(project => {
      const category = project.category || 'uncategorized';
      if (!groupedProjects[category]) {
        groupedProjects[category] = {
          displayName: categoryDisplayNames[category] || category,
          projects: []
        };
      }
      groupedProjects[category].projects.push(project);
    });

    return groupedProjects;
  }, [filteredProjects]);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

   const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete project");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Success",
        description: "Project deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete project: ${error.message}`,
        variant: "destructive",
      });
    },
  });

    const handleCreateSuccess = () => {
        setIsDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({
            title: "Success",
            description: "Project created successfully.",
        });
    };

  return (
    <div className="flex h-screen w-full max-w-none">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden max-w-none">
        <Header />
        <div className="flex-1 overflow-auto p-2 lg:p-4 xl:p-6 max-w-none">
          <div className="w-full max-w-none space-y-3 lg:space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
                <p className="text-gray-600 mt-1">Manage and track your digital agency projects</p>
              </div>
            </div>

            {/* Project Status Dashboard Cards - Only for Operations Managers and Project Managers */}
            {(user?.role === "project_manager" || user?.role === "operations_manager" || user?.role === "team_lead" || user?.specialization === "operations_manager") && (
            <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4 xl:gap-6 mb-4 lg:mb-6">
              {/* Project Overdue Card */}
              <div className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                statusFilter === 'overdue' ? 'bg-red-100 border-red-300' : 'bg-red-50 border-red-200'
              }`}
                   onClick={() => setStatusFilter(statusFilter === 'overdue' ? null : 'overdue')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-600">Project Overdue</p>
                    <p className="text-2xl font-bold text-red-700">
                      {projects?.filter(project => {
                        const now = new Date();
                        const endDate = new Date(project.endDate || '');
                        return endDate < now && project.status !== 'completed';
                      }).length || 0}
                    </p>
                    <p className="text-xs text-red-500 mt-1">Projects past deadline</p>
                  </div>
                  <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Completed Projects This Week Card */}
              <div className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                statusFilter === 'completed_week' ? 'bg-green-100 border-green-300' : 'bg-green-50 border-green-200'
              }`}
                   onClick={() => setStatusFilter(statusFilter === 'completed_week' ? null : 'completed_week')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-600">Completed This Week</p>
                    <p className="text-2xl font-bold text-green-700">
                      {(() => {
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);

                        return projects?.filter(project => {
                          if (project.status !== 'completed') return false;
                          const updatedDate = new Date(project.updatedAt || '');
                          return updatedDate >= weekAgo;
                        }).length || 0;
                      })()}
                    </p>
                    <p className="text-xs text-green-500 mt-1">Projects finished recently</p>
                  </div>
                  <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Urgent Attention Required Card */}
              <div className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                statusFilter === 'urgent' ? 'bg-red-100 border-red-400' : 'bg-red-50 border-red-300'
              }`}
                   onClick={() => setStatusFilter(statusFilter === 'urgent' ? null : 'urgent')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-700">Urgent Attention</p>
                    <p className="text-2xl font-bold text-red-800">
                      {(() => {
                        const tenWorkingDaysAgo = new Date();
                        tenWorkingDaysAgo.setDate(tenWorkingDaysAgo.getDate() - 14);

                        return projects?.filter(project => {
                          if (project.status === 'completed') return false;
                          const lastUpdate = new Date(project.updatedAt || '');
                          return lastUpdate < tenWorkingDaysAgo;
                        }).length || 0;
                      })()}
                    </p>
                    <p className="text-xs text-red-600 mt-1">No activity for 10+ days</p>
                  </div>
                  <div className="h-8 w-8 bg-red-200 rounded-full flex items-center justify-center">
                    <svg className="h-5 w-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Clear Filter Button */}
            {statusFilter && (user?.role === "project_manager" || user?.role === "operations_manager" || user?.role === "team_lead" || user?.specialization === "operations_manager") && (
              <div className="mb-4">
                <Button 
                  variant="outline" 
                  onClick={() => setStatusFilter(null)}
                  className="text-sm"
                >
                  Clear Filter - Showing {
                    statusFilter === 'overdue' ? 'Overdue Projects' :
                    statusFilter === 'completed_week' ? 'Completed This Week' :
                    statusFilter === 'urgent' ? 'Urgent Attention Required' : ''
                  }
                </Button>
              </div>
            )}

            <div className="flex justify-between items-center">
              {(user?.role === "project_manager" || user?.role === "product_owner" || user?.role === "customer_support_officer" || user?.role === "operations_manager" || user?.role === "team_lead" || user?.specialization === "operations_manager") && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 font-medium">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create New Project</DialogTitle>
                    </DialogHeader>
                    <ProjectForm 
                      onSuccess={handleCreateSuccess} 
                      restrictToSupportMaintenance={false}
                      isCustomerSupportOfficer={user?.role === "customer_support_officer"}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>

          {Object.entries(projectsByCategory).length > 0 ? (
            <div className="space-y-6">
              {Object.entries(projectsByCategory).map(([category, { displayName, projects }]) => (
                <div key={category} className="border rounded-lg shadow-sm">
                  <Collapsible 
                    open={expandedCategories.has(category)} 
                    onOpenChange={() => toggleCategory(category)}
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 hover:bg-muted rounded-t-lg text-left border-b border-border/50">
                      <h2 className="text-lg font-semibold flex items-center">
                        {expandedCategories.has(category) ? 
                          <ChevronDown className="mr-2 h-4 w-4 text-primary" /> : 
                          <ChevronRight className="mr-2 h-4 w-4 text-primary" />
                        }
                        {displayName}
                      </h2>
                      <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium">
                        {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                      </span>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="p-3 lg:p-4 xl:p-6 space-y-4 lg:space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                          {projects.map((project) => (
                            <ProjectCard
                              key={project.id}
                              project={project}
                              handleClick={() => {
                                window.location.href = `/dashboard/projects/${project.id}`;
                              }}
                            />
                          ))}
                        </div>

                        {/* Keep the original list view for larger screens as fallback */}
                        <div className="hidden">
                          {projects.map((project) => (
                            <div 
                              key={project.id} 
                              className="flex items-center justify-between p-4 lg:p-5 bg-card hover:bg-muted/50 border rounded-lg cursor-pointer transition-colors"
                            >
                            <div className="flex items-center space-x-4 flex-1 min-w-0 cursor-pointer" onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('Navigating to project:', project.id);
                              window.location.href = `/dashboard/projects/${project.id}`;
                            }}>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm truncate" title={project.name}>
                                  {project.name}
                                </h3>
                                <p className="text-xs text-muted-foreground truncate">
                                  {project.description || "No description"}
                                </p>
                              </div>
                              <div className="flex items-center space-x-3">
                                <div className="w-28 lg:w-32">
                                  <div className="flex justify-between text-xs mb-1">
                                    <span>Progress</span>
                                    <span>{project.progress || 0}%</span>
                                  </div>
                                  <div className="w-full bg-secondary rounded-full h-1.5">
                                    <div 
                                      className="bg-primary h-1.5 rounded-full transition-all duration-300" 
                                      style={{ width: `${project.progress || 0}%` }}
                                    />
                                  </div>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className={`${
                                    project.status === 'active' ? 'bg-green-500' :
                                    project.status === 'pending' ? 'bg-yellow-500' : 'bg-gray-500'
                                  } text-white text-xs`}
                                >
                                  {project.status}
                                </Badge>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(project.startDate || '').toLocaleDateString()} - {new Date(project.endDate || '').toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            {/* Check if user can edit projects (project managers, product owners, customer support officers, and operations managers) */}
                            {(user?.role === "project_manager" || user?.role === "product_owner" || user?.role === "customer_support_officer" || user?.role === "operations_manager" || user?.role === "team_lead" || user?.specialization === "operations_manager") && (
                              <div className="flex space-x-2">
                                <Dialog open={isEditDialogOpen && editingProject?.id === project.id} onOpenChange={(open) => {
                                  setIsEditDialogOpen(open);
                                  if (!open) {
                                    setEditingProject(null);
                                  }
                                }}>
                                  <DialogTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingProject(project);
                                        setIsEditDialogOpen(true);
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>Edit Project</DialogTitle>
                                    </DialogHeader>
                                    {editingProject && editingProject.id === project.id && (
                                      <ProjectForm 
                                        project={editingProject} 
                                        onSuccess={() => {
                                          setIsEditDialogOpen(false);
                                          setEditingProject(null);
                                          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                                          toast({
                                            title: "Success",
                                            description: "Project updated successfully.",
                                          });
                                        }}
                                        restrictToSupportMaintenance={user?.role === "product_owner"}
                                        isCustomerSupportOfficer={user?.role === "customer_support_officer"}
                                      />
                                    )}
                                  </DialogContent>
                                </Dialog>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="icon" variant="ghost">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete the project from our servers.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteProjectMutation.mutate(project.id.toString());
                                        }}
                                        disabled={deleteProjectMutation.isPending}
                                      >
                                        {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                            
                          </div>
                        ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No projects found</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}