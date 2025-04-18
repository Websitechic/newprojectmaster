import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { useLocation } from "wouter";
import { ProjectCard } from "@/components/project/project-card";
import { Button } from "@/components/ui/button";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ProjectForm } from "@/components/project/project-form";
import type { Project } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { useState, useMemo } from "react";

export default function Projects() {
  const [location] = useLocation();
  const [filter, setFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { user } = useUser();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const filteredProjects = projects?.filter(project => {
    if (filter === "all") return true;
    return project.status === filter;
  });
  
  // Set of expanded categories (initially all expanded)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([
    'website_development',
    'dpl_outright',
    'dpl_partnership',
    'direct_marketing',
    'support_maintenance',
    'uncategorized' // For projects without a category
  ]));
  
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
                  <DialogContent className="sm:max-w-[600px]">
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
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/30 hover:bg-muted rounded-t-lg text-left">
                      <h2 className="text-xl font-semibold flex items-center">
                        {expandedCategories.has(category) ? 
                          <ChevronDown className="mr-2 h-5 w-5" /> : 
                          <ChevronRight className="mr-2 h-5 w-5" />
                        }
                        {displayName}
                      </h2>
                      <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs">
                        {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                      </span>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((project) => (
                          <ProjectCard key={project.id} project={project} />
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