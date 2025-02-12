import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { useLocation } from "wouter";
import { TaskList } from "@/components/task/task-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Task, Project } from "@db/schema";
import { useState } from "react";

export default function Tasks() {
  const [location] = useLocation();
  const [filter, setFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState<string>("");

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    refetchOnWindowFocus: true,
    staleTime: 5000, // Consider data stale after 5 seconds
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    refetchOnWindowFocus: true,
  });

  const filteredTasks = tasks?.filter(task => {
    if (filter === "all" && !selectedProject) return true;
    if (filter !== "all" && !selectedProject) return task.status === filter;
    if (filter === "all" && selectedProject) return task.projectId === parseInt(selectedProject);
    return task.status === filter && task.projectId === parseInt(selectedProject);
  });

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