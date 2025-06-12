import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TaskList } from "@/components/task/task-list";
import type { Task } from "@db/schema";

// Placeholder for user context, replace with actual implementation
const user = {
  role: "staff",
  specialization: "technical_support",
};

export default function ProjectTasks() {
  const { id } = useParams();
  const projectId = parseInt(id!);

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: [`/api/projects/${projectId}/tasks`],
    queryFn: () => fetch(`/api/projects/${projectId}/tasks`).then(res => res.json()),
    enabled: !!id,
  });

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
            <h1 className="text-2xl font-bold">Project Tasks</h1>
          </div>
          <TaskList tasks={tasks || []} projectId={projectId} />
        </div>
      </div>
    </div>
  );
}