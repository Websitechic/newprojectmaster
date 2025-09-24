import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { useLocation } from "wouter";
import { TaskList } from "@/components/task/task-list";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Task, Project } from "@db/schema";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function Tasks() {
  const [location] = useLocation();
  const [filter, setFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tasks, isLoading: tasksLoading, error: tasksError } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    refetchOnWindowFocus: true,
    staleTime: 0, // Always fetch fresh data
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!user, // Only fetch if user is authenticated
  });

  const { data: projects, isLoading: projectsLoading, error: projectsError } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    refetchOnWindowFocus: true,
    staleTime: 0, // Always fetch fresh data
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!user, // Only fetch if user is authenticated
  });

  const filteredTasks = tasks?.filter((task: Task) => {
    if (filter === "all" && !selectedProject) return true;
    if (filter !== "all" && !selectedProject) return task.status === filter;
    if (filter === "all" && selectedProject) return task.projectId === parseInt(selectedProject);
    return task.status === filter && task.projectId === parseInt(selectedProject);
  });

  // Mock definition of canCreateTasks for demonstration since it's missing
  const canCreateTasks = user?.role === "project_manager" || (user?.role === "staff" && user?.specialization === "technical_support");

  if (!user) {
    return null; // Let the auth redirect handle this
  }

  if (tasksLoading || projectsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Handle potential errors from queries
  if (tasksError) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Error loading tasks: {tasksError.message}
      </div>
    );
  }
  if (projectsError) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Error loading projects: {projectsError.message}
      </div>
    );
  }


  // Set up WebSocket real-time updates for tasks
  useEffect(() => {
    if (!user?.id) return;

    const handleTaskUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log("Task update received via WebSocket, invalidating queries");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    };

    const handleTaskCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log("Task creation received via WebSocket, invalidating queries");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    };

    window.addEventListener('websocket:task_update', handleTaskUpdate as EventListener);
    window.addEventListener('websocket:task_created', handleTaskCreated as EventListener);

    return () => {
      window.removeEventListener('websocket:task_update', handleTaskUpdate as EventListener);
      window.removeEventListener('websocket:task_created', handleTaskCreated as EventListener);
    };
  }, [user?.id, queryClient]);


  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Tasks</h1>
            <div className="flex gap-4">
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Projects</SelectItem>
                  {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tasks</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedProject ? (
            <TaskList tasks={filteredTasks || []} projectId={parseInt(selectedProject)} />
          ) : (
            <div className="text-center text-muted-foreground mt-8">
              Please select a project to manage tasks
            </div>
          )}
        </div>
      </div>
    </div>
  );
}