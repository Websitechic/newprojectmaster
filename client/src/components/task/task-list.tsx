import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task } from "@db/schema";

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps) {
  const queryClient = useQueryClient();

  const updateProgress = useMutation({
    mutationFn: async ({ taskId, progress }: { taskId: number; progress: number }) => {
      const response = await fetch(`/api/tasks/${taskId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress }),
      });

      if (!response.ok) {
        throw new Error("Failed to update task progress");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <Card key={task.id} className="p-4">
          <div className="flex items-start gap-4">
            <Checkbox
              checked={task.status === "completed"}
              onCheckedChange={(checked) => {
                updateProgress.mutate({
                  taskId: task.id,
                  progress: checked ? 100 : 0,
                });
              }}
            />
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold">{task.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {task.description}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={getPriorityColor(task.priority)}
                >
                  {task.priority}
                </Badge>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{task.progress}%</span>
                </div>
                <Progress value={task.progress} />
              </div>
              <div className="mt-4 flex justify-between items-center">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {task.title.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">
                  Due {new Date(task.deadline!).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}