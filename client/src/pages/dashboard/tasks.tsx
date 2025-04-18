import { useQuery } from "@tanstack/react-query";
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
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Tasks() {
  const [location] = useLocation();
  const [filter, setFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const { user } = useAuth();

  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    refetchOnWindowFocus: true,
    staleTime: 0, // Always fetch fresh data
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!user, // Only fetch if user is authenticated
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    refetchOnWindowFocus: true,
    staleTime: 0, // Always fetch fresh data
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!user, // Only fetch if user is authenticated
  });

  // Filter tasks based on the user's role
  const userTasks = tasks?.filter((task: Task) => {
    // For staff, only show tasks assigned to them
    if (user?.role === "staff") {
      return task.assigneeId === user.id;
    }
    return true; // Managers and clients see all tasks
  });

  const filteredTasks = userTasks?.filter((task: Task) => {
    if (filter === "all" && !selectedProject) return true;
    if (filter !== "all" && !selectedProject) return task.status === filter;
    if (filter === "all" && selectedProject) return task.projectId === parseInt(selectedProject);
    return task.status === filter && task.projectId === parseInt(selectedProject);
  });

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

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Tasks</h1>
              {user.role === "staff" && (
                <p className="text-muted-foreground mt-1">
                  Viewing your assigned tasks
                  <Badge className="ml-2" variant="outline">
                    {filteredTasks?.length || 0} tasks
                  </Badge>
                </p>
              )}
            </div>
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

          {filteredTasks && filteredTasks.length > 0 ? (
            selectedProject ? (
              <TaskList tasks={filteredTasks} projectId={parseInt(selectedProject)} />
            ) : (
              <div className="grid gap-4">
                {filteredTasks.map(task => (
                  <div key={task.id} className="border rounded-md p-4">
                    <h3 className="font-medium">{task.title}</h3>
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={task.status === 'completed' ? 'default' : 'outline'}>
                        {task.status === 'todo' ? 'Todo' : 
                         task.status === 'in_progress' ? 'In Progress' :
                         task.status === 'completed' ? 'Completed' :
                         task.status === 'review' ? 'Review' : 'Todo'}
                      </Badge>
                      {task.projectId && projects?.find(p => p.id === task.projectId) && (
                        <Badge variant="secondary">
                          {projects?.find(p => p.id === task.projectId)?.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="text-center text-muted-foreground mt-8">
              {user.role === "staff" 
                ? "You don't have any assigned tasks that match the current filters" 
                : "No tasks found with the current filter settings"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}