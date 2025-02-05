
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash, Plus } from "lucide-react";
import type { Task } from "@db/schema";

interface TaskListProps {
  tasks: Task[];
  projectId: number;
}

export function TaskList({ tasks, projectId }: TaskListProps) {
  const queryClient = useQueryClient();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    status: "new",
    assigneeId: "",
    startDate: "",
    endDate: "",
  });

  const createTask = useMutation({
    mutationFn: async (task: typeof newTask) => {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, projectId }),
      });
      if (!response.ok) throw new Error("Failed to create task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api/tasks"] });
      setNewTask({ title: "", description: "", status: "new", assigneeId: "", startDate: "", endDate: "" });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (task: Task) => {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      });
      if (!response.ok) throw new Error("Failed to update task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api/tasks"] });
      setEditTask(null);
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
      queryClient.invalidateQueries({ queryKey: ["api/tasks"] });
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

  const columns = ["new", "in_progress", "completed", "overdue"];

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
              onSubmit={(task) => createTask.mutate(task)}
              onChange={setNewTask}
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
                                  <h4 className="font-semibold">{task.title}</h4>
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
                                <p className="text-sm text-muted-foreground">
                                  {task.description}
                                </p>
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
              onSubmit={(task) => updateTask.mutate(task as Task)}
              onChange={(task) => setEditTask(task as Task)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskForm({ task, onSubmit, onChange }: any) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Title</Label>
        <Input
          value={task.title}
          onChange={e => onChange({ ...task, title: e.target.value })}
        />
      </div>
      <div>
        <Label>Description</Label>
        <Input
          value={task.description}
          onChange={e => onChange({ ...task, description: e.target.value })}
        />
      </div>
      <div>
        <Label>Assignee ID</Label>
        <Input
          value={task.assigneeId}
          onChange={e => onChange({ ...task, assigneeId: e.target.value })}
        />
      </div>
      <div>
        <Label>Start Date</Label>
        <Input
          type="datetime-local"
          value={task.startDate}
          onChange={e => onChange({ ...task, startDate: e.target.value })}
        />
      </div>
      <div>
        <Label>End Date</Label>
        <Input
          type="datetime-local"
          value={task.endDate}
          onChange={e => onChange({ ...task, endDate: e.target.value })}
        />
      </div>
      <Button onClick={() => onSubmit(task)}>
        {task.id ? 'Update Task' : 'Create Task'}
      </Button>
    </div>
  );
}
