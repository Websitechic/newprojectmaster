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
import { Input } from "@/components/ui/input";
import type { Task, Project } from "@db/schema";
import { useState, useEffect } from "react";
import { Loader2, Search, Calendar as CalendarIcon } from "lucide-react";
import { format, isSameDay, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export default function Tasks() {
  const [location] = useLocation();
  const [filter, setFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [date, setDate] = useState<Date | { from: Date; to: Date } | undefined>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tasks, isLoading: tasksLoading, error: tasksError } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false,
    staleTime: Infinity, // Never mark as stale - rely on optimistic updates
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!user, // Only fetch if user is authenticated
  });

  const { data: projects, isLoading: projectsLoading, error: projectsError } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!user, // Only fetch if user is authenticated
  });

  const filteredTasks = tasks?.filter((task: Task) => {
    // Apply search filter
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Apply date filter
    if (date) {
      const taskDate = task.deadline ? new Date(task.deadline) : (task.startDate ? new Date(task.startDate) : null);
      if (!taskDate) return false;

      if (date instanceof Date) {
        if (!isSameDay(taskDate, date)) return false;
      } else if (date.from && date.to) {
        if (!isWithinInterval(taskDate, { start: startOfDay(date.from), end: endOfDay(date.to) })) return false;
      } else if (date.from) {
        if (!isSameDay(taskDate, date.from)) return false;
      }
    }

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


  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <h1 className="text-2xl font-bold">Tasks</h1>
              <div className="flex flex-wrap gap-2 sm:gap-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full sm:w-[240px] justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date instanceof Date ? (
                        format(date, "PPP")
                      ) : date?.from ? (
                        date.to ? (
                          <>
                            {format(date.from, "LLL dd, y")} -{" "}
                            {format(date.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(date.from, "PPP")
                        )
                      ) : (
                        <span>Pick a date or range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={date instanceof Date ? date : date?.from}
                      selected={date as any}
                      onSelect={setDate as any}
                      numberOfMonths={1}
                    />
                    {date && (
                      <div className="p-3 border-t">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-center"
                          onClick={() => setDate(undefined)}
                        >
                          Clear Selection
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="w-full sm:w-[200px]">
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
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tasks</SelectItem>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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