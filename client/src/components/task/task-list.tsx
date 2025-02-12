import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash, Plus } from "lucide-react";
import type { Task, Project } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface TaskListProps {
  tasks: Task[];
  projectId: number;
}

export function TaskList({ tasks, projectId }: TaskListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    status: "todo",
    assigneeId: "",
    deadline: "",
  });

  // Fetch available staff for assignment
  const { data: staff } = useQuery({
    queryKey: ["/api/staff"],
  });

  const createTask = useMutation({
    mutationFn: async (task: typeof newTask) => {
      // Format the deadline properly if it exists
      const formattedTask = {
        ...task,
        deadline: task.deadline ? new Date(task.deadline).toISOString() : null,
      };

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formattedTask, projectId }),
      });
      if (!response.ok) throw new Error("Failed to create task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Task created successfully",
      });
      setNewTask({
        title: "",
        description: "",
        status: "todo",
        assigneeId: "",
        deadline: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (task: Task) => {
      // Format the deadline properly if it exists
      const formattedTask = {
        ...task,
        deadline: task.deadline ? new Date(task.deadline).toISOString() : null,
      };

      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formattedTask),
      });
      if (!response.ok) throw new Error("Failed to update task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditTask(null);
      toast({
        title: "Success",
        description: "Task updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete task");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Task deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onDragEnd = (result: any) => {
    if (!result.destination) return;

    const task = tasks.find(t => t.id.toString() === result.draggableId);
    if (task) {
      updateTask.mutate({
        ...task,
        status: result.destination.droppableId,
      });
    }
  };

  const columns = ["todo", "in_progress", "completed", "review"];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <TaskForm
              task={newTask}
              staff={staff}
              onSubmit={(task) => createTask.mutate(task)}
              onChange={setNewTask}
              projectId={projectId}
            />
          </DialogContent>
        </Dialog>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-4 gap-4">
          {columns.map(status => (
            <div key={status} className="space-y-4">
              <h3 className="font-semibold capitalize">{status.replace("_", " ")}</h3>
              <Droppable droppableId={status}>
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="min-h-[200px] space-y-2"
                  >
                    {tasks
                      .filter(task => task.status === status)
                      .map((task, index) => (
                        <Draggable
                          key={task.id}
                          draggableId={task.id.toString()}
                          index={index}
                        >
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <Card className="p-4">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h4 className="font-semibold">{task.title}</h4>
                                    <p className="text-sm text-muted-foreground">
                                      {task.description}
                                    </p>
                                    {task.assigneeId && (
                                      <p className="text-sm text-muted-foreground mt-2">
                                        Assigned to: {staff?.find(s => s.id === task.assigneeId)?.name}
                                      </p>
                                    )}
                                    {task.deadline && (
                                      <p className="text-sm text-muted-foreground">
                                        Due: {new Date(task.deadline).toLocaleDateString()}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setEditTask(task)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteTask.mutate(task.id)}
                                    >
                                      <Trash className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </Card>
                            </div>
                          )}
                        </Draggable>
                      ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      <Dialog open={!!editTask} onOpenChange={() => setEditTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editTask && (
            <TaskForm
              task={editTask}
              staff={staff}
              onSubmit={(task) => updateTask.mutate(task as Task)}
              onChange={(task) => setEditTask(task as Task)}
              projectId={projectId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TaskFormProps {
  task: any;
  staff?: any[];
  onSubmit: (task: any) => void;
  onChange: (task: any) => void;
  projectId: number;
}

function TaskForm({ task, staff, onSubmit, onChange, projectId }: TaskFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Title</Label>
        <Input
          value={task.title}
          onChange={e => onChange({ ...task, title: e.target.value })}
          placeholder="Enter task title"
        />
      </div>
      <div>
        <Label>Description</Label>
        <Input
          value={task.description}
          onChange={e => onChange({ ...task, description: e.target.value })}
          placeholder="Enter task description"
        />
      </div>
      <div>
        <Label>Assignee</Label>
        <Select
          value={task.assigneeId}
          onValueChange={(value) => onChange({ ...task, assigneeId: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select assignee" />
          </SelectTrigger>
          <SelectContent>
            {staff?.map((member) => (
              <SelectItem key={member.id} value={member.id.toString()}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Deadline</Label>
        <Input
          type="datetime-local"
          value={task.deadline}
          onChange={e => onChange({ ...task, deadline: e.target.value })}
        />
      </div>
      <Button onClick={() => onSubmit({ ...task, projectId })} className="w-full">
        {task.id ? 'Update Task' : 'Create Task'}
      </Button>
    </div>
  );
}