import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectCard } from "@/components/project/project-card";
import { TaskList } from "@/components/task/task-list";
import { ChatWindow } from "@/components/chat/chat-window";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Project, Task } from "@db/schema";

export default function Dashboard() {
  const [location] = useLocation();
  const { user } = useUser();
  const { updateStatus } = useWebSocket(user?.id);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  useEffect(() => {
    // Update user status when dashboard mounts
    updateStatus("online");

    return () => {
      updateStatus("offline");
    };
  }, [updateStatus]);

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Active Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {projects?.filter(p => p.status === "active").length || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Pending Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {tasks?.filter(t => t.status === "todo").length || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {projects && projects.length > 0
                    ? Math.round(
                        projects.reduce((acc, p) => acc + (p.progress || 0), 0) /
                          projects.length
                      )
                    : 0}
                  %
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Recent Projects</h2>
              <div className="grid gap-4">
                {projects?.slice(0, 2).map(project => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </div>
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Tasks</h2>
              {projects && projects.length > 0 ? (
                <TaskList 
                  tasks={tasks?.filter(task => task.projectId === projects[0].id) || []} 
                  projectId={projects[0].id} 
                />
              ) : (
                <div className="text-center text-muted-foreground mt-8">
                  No projects available. Create a project to manage tasks.
                </div>
              )}
              <ChatWindow />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}