import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { Project } from "@db/schema";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  clientId: z.string().optional(),
  pendingClientEmail: z.string().email().optional().or(z.literal("")),
  teamMembers: z.array(z.string()).optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  project?: Project;
  onSuccess?: () => void;
}

export function ProjectForm({ project, onSuccess }: ProjectFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      clientId: "",
      pendingClientEmail: "",
      teamMembers: [],
      startDate: "",
      endDate: "",
    },
  });

  // Update form values when project prop changes
  useEffect(() => {
    if (project) {
      form.reset({
        name: project.name || "",
        description: project.description || "",
        category: project.category || "",
        clientId: project.clientId?.toString() || "none",
        pendingClientEmail: project.pendingClientEmail || "",
        teamMembers: [],
        startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : "",
        endDate: project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : "",
      });
    }
  }, [project, form]);

  // Fetch clients for the dropdown
  const { data: clients } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: () => fetch("/api/clients").then(res => res.json()),
  });

  // Fetch staff for team members
  const { data: staff } = useQuery({
    queryKey: ["/api/staff"],
    queryFn: () => fetch("/api/staff").then(res => res.json()),
  });

  const saveProject = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      // Prepare the data
      const formData = {
        name: data.name,
        description: data.description || "",
        category: data.category,
        clientId: data.clientId && data.clientId !== "" && data.clientId !== "none" ? parseInt(data.clientId) : null,
        pendingClientEmail: data.pendingClientEmail || null,
        teamMembers: data.teamMembers?.map(id => parseInt(id)) || [],
        startDate: data.startDate,
        endDate: data.endDate,
      };

      console.log("Submitting project data:", formData);

      if (project) {
        // Update existing project
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error("Update error response:", errorData);
          try {
            const errorJson = JSON.parse(errorData);
            throw new Error(errorJson.error || "Failed to update project");
          } catch {
            throw new Error(`Failed to update project: ${response.status} ${response.statusText}`);
          }
        }

        return response.json();
      } else {
        // Create new project
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            ...formData,
            type: "web_development", // Default type
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error("Create error response:", errorData);
          try {
            const errorJson = JSON.parse(errorData);
            throw new Error(errorJson.error || "Failed to create project");
          } catch {
            throw new Error(`Failed to create project: ${response.status} ${response.statusText}`);
          }
        }

        return response.json();
      }
    },
    onSuccess: (data) => {
      console.log("Project saved successfully:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Success",
        description: project ? "Project updated successfully!" : "Project created successfully!",
      });
      if (!project) {
        form.reset();
      }
      onSuccess?.();
    },
    onError: (error: Error) => {
      console.error("Project save error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => saveProject.mutate(data))} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter project name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Enter project description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="website_development">Website Development</SelectItem>
                  <SelectItem value="dpl_outright">DPL Outright</SelectItem>
                  <SelectItem value="dpl_partnership">DPL Partnership</SelectItem>
                  <SelectItem value="direct_marketing">Direct Marketing</SelectItem>
                  <SelectItem value="support_maintenance">Support & Maintenance</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No client selected</SelectItem>
                  {clients?.map((client: any) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.name} ({client.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="pendingClientEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pending Client Email (if no client selected)</FormLabel>
              <FormControl>
                <Input 
                  type="email" 
                  placeholder="client@example.com" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full mt-4" disabled={saveProject.isPending}>
          {saveProject.isPending ? (project ? "Updating..." : "Creating...") : (project ? "Update Project" : "Create Project")}
        </Button>
      </form>
    </Form>
  );
}