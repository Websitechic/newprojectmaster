
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TaskList } from "@/components/task/task-list";
import { useAuth } from "@/hooks/use-auth";
import type { Task } from "@db/schema";
import { useEffect } from "react";

export default function StaffProjectTasks() {
  const { id } = useParams();
  const { user } = useAuth();
  const projectId = parseInt(id!);

  const { data: allTasks, isLoading, refetch } = useQuery<Task[]>({
    queryKey: [`/api/projects/${projectId}/tasks`],
    queryFn: () => fetch(`/api/projects/${projectId}/tasks`).then(res => res.json()),
    enabled: !!id,
    refetchInterval: 5000, // Refetch every 5 seconds to catch reassignments
  });

  // Filter tasks to show only those assigned to the current staff member
  const myTasks = allTasks?.filter(task => task.assigneeId === user?.id) || [];

  // Refetch tasks when user changes (in case of reassignment)
  useEffect(() => {
    if (user?.id) {
      refetch();
    }
  }, [user?.id, refetch]);

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
            <h1 className="text-2xl font-bold">My Tasks</h1>
            <p className="text-muted-foreground">
              Tasks assigned to you in this project ({myTasks.length} tasks)
            </p>
            {myTasks.length > 0 && (
              <p className="text-sm text-blue-600 mt-1">
                Note: Tasks will be automatically removed from this view if reassigned to another team member.
              </p>
            )}
          </div>
          
          {myTasks.length > 0 ? (
            <TaskList tasks={myTasks} projectId={projectId} isStaffView={true} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-blue-50 p-4 rounded-full mb-4">
                <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-2">No Tasks Assigned</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                You don't have any tasks assigned to you in this project yet. 
                Your project manager will assign tasks to you when they're ready.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                If you previously had tasks that are no longer visible, they may have been reassigned to another team member.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
