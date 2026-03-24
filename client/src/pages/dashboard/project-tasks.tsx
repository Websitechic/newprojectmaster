import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TaskList } from "@/components/task/task-list";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Task } from "@db/schema";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect } from "react";

export default function ProjectTasks() {
  const { id } = useParams();
  const [_, setLocation] = useLocation();
  const projectId = parseInt(id!);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  useWebSocket(user?.id);

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: [`/api/projects/${projectId}/tasks`],
    queryFn: () => fetch(`/api/projects/${projectId}/tasks`).then(res => res.json()),
    staleTime: 30000,
    enabled: !!id,
  });

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    };
    window.addEventListener('websocket:task_created', invalidate);
    window.addEventListener('websocket:task_updated', invalidate);
    window.addEventListener('websocket:task_deleted', invalidate);
    return () => {
      window.removeEventListener('websocket:task_created', invalidate);
      window.removeEventListener('websocket:task_updated', invalidate);
      window.removeEventListener('websocket:task_deleted', invalidate);
    };
  }, [queryClient, projectId]);

  const canManageTasks = user?.role === "project_manager" || (user?.role === "staff" && user?.specialization === "technical_support");

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`/dashboard/projects/${id}`)}
              className="flex items-center gap-2 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Project
            </Button>
            <h1 className="text-2xl font-bold">Project Tasks</h1>
          </div>
          <TaskList tasks={tasks || []} projectId={projectId} />
        </div>
      </div>
    </div>
  );
}