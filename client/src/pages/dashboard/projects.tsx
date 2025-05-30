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
    if (filter === "all") return true;
    return project.status === filter;
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

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Projects</h1>
            <div className="flex gap-4">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {user?.role === "project_manager" && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      New Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create New Project</DialogTitle>
                    </DialogHeader>
                    <ProjectForm onSuccess={() => setIsDialogOpen(false)} />
                  </DialogContent>
                </Dialog>
              )}
            </div>
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
                      <div className="p-3 space-y-2">
                        {projects.map((project) => (
                          <div 
                            key={project.id} 
                            className="flex items-center justify-between p-3 bg-card hover:bg-muted/50 border rounded-lg cursor-pointer transition-colors"
                            
                          >
                            <div className="flex items-center space-x-4 flex-1 min-w-0" onClick={() => window.location.href = `/dashboard/projects/${project.id}`}>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm truncate" title={project.name}>
                                  {project.name}
                                </h3>
                                <p className="text-xs text-muted-foreground truncate">
                                  {project.description || "No description"}
                                </p>
                              </div>
                              <div className="flex items-center space-x-3">
                                <div className="w-24">
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
                             {user?.role === "project_manager" && (
                              <div className="flex space-x-2">
                                <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
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
                                    {editingProject && (
                                      <ProjectForm 
                                        project={editingProject} 
                                        onSuccess={() => {
                                          setIsEditDialogOpen(false);
                                          setEditingProject(null);
                                        }} 
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
  );
}