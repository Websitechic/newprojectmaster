import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Trash2 } from "lucide-react";
import type { Project } from "@db/schema";

const deliverableSchema = z.object({
  name: z.string().min(1, "Deliverable name is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
});

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  clientId: z.string().optional(),
  teamMembers: z.array(z.string()).optional().default([]),
  // Project plan fields
  planName: z.string().min(1, "Project plan name is required"),
  planDescription: z.string().optional(),
  planStartDate: z.string().min(1, "Plan start date is required"),
  planEndDate: z.string().min(1, "Plan end date is required"),
  deliverables: z.array(deliverableSchema).min(1, "At least one deliverable is required"),
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
      name: project?.name || "",
      description: project?.description || "",
      category: project?.category || "",
      startDate: project?.startDate ? new Date(project.startDate).toISOString().split('T')[0] : "",
      endDate: project?.endDate ? new Date(project.endDate).toISOString().split('T')[0] : "",
      clientId: project?.clientId?.toString() || "",
      teamMembers: [],
      planName: "",
      planDescription: "",
      planStartDate: project?.startDate ? new Date(project.startDate).toISOString().split('T')[0] : "",
      planEndDate: project?.endDate ? new Date(project.endDate).toISOString().split('T')[0] : "",
      deliverables: [
        {
          name: "",
          startDate: "",
          endDate: "",
        }
      ],
    },
  });

  // Fetch clients for dropdown
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
      const projectData = {
        name: data.name,
        description: data.description || "",
        type: "one_time", // Default type since it's still required in the backend
        category: data.category,
        startDate: data.startDate,
        endDate: data.endDate,
        clientId: data.clientId && data.clientId !== "none" ? parseInt(data.clientId) : null,
        teamMembers: data.teamMembers || [],
      };

      let savedProject;

      if (project) {
        // Update existing project
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectData),
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(errorData || "Failed to update project");
        }

        savedProject = await response.json();
      } else {
        // Create new project
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectData),
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(errorData || "Failed to create project");
        }

        savedProject = await response.json();

        // Create project plan for new projects
        const planData = {
          projectId: savedProject.id,
          name: data.planName,
          description: data.planDescription || "",
          startDate: data.planStartDate,
          endDate: data.planEndDate,
          deliverables: data.deliverables,
        };

        const planResponse = await fetch(`/api/projects/${savedProject.id}/plans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.planName,
            description: data.planDescription,
            startDate: data.planStartDate,
            endDate: data.planEndDate,
            deliverables: data.deliverables,
          }),
        });

        if (!planResponse.ok) {
          const planError = await planResponse.text();
          throw new Error(`Failed to create project plan: ${planError}`);
        }
      }

      return savedProject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/project-plans"] });
      toast({
        title: "Success",
        description: project ? "Project updated successfully!" : "Project and plan created successfully!",
      });
      if (!project) {
        form.reset();
      }
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addDeliverable = () => {
    const currentDeliverables = form.getValues("deliverables");
    form.setValue("deliverables", [
      ...currentDeliverables,
      { name: "", startDate: "", endDate: "" }
    ]);
  };

  const removeDeliverable = (index: number) => {
    const currentDeliverables = form.getValues("deliverables");
    if (currentDeliverables.length > 1) {
      form.setValue("deliverables", currentDeliverables.filter((_, i) => i !== index));
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => saveProject.mutate(data))} className="space-y-6">
        {/* Project Information Section */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium">Project Information</h3>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    <Textarea 
                      placeholder="Enter project description" 
                      className="min-h-[100px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
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

              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No client</SelectItem>
                        {clients?.map((client: any) => (
                          <SelectItem key={client.id} value={client.id.toString()}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
              name="teamMembers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Members</FormLabel>
                  <div className="space-y-2">
                    {staff?.map((member: any) => (
                      <div key={member.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`member-${member.id}`}
                          checked={field.value?.includes(member.id.toString()) || false}
                          onChange={(e) => {
                            const currentValue = field.value || [];
                            if (e.target.checked) {
                              field.onChange([...currentValue, member.id.toString()]);
                            } else {
                              field.onChange(currentValue.filter((id: string) => id !== member.id.toString()));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <label htmlFor={`member-${member.id}`} className="text-sm">
                          {member.name} ({member.specialization})
                        </label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Project Plan Section - Only show for new projects */}
        {!project && (
          <Card>
            <CardHeader>
              <h3 className="text-lg font-medium">Project Plan</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="planName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter plan name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="planDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter plan description" 
                        className="min-h-[80px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="planStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan Start Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="planEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Deliverables Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <FormLabel>Deliverables</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addDeliverable}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Deliverable
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="deliverables"
                  render={({ field }) => (
                    <FormItem>
                      <div className="space-y-4">
                        {field.value.map((deliverable, index) => (
                          <Card key={index} className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-medium">Deliverable {index + 1}</h4>
                              {field.value.length > 1 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeDeliverable(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <FormLabel>Name</FormLabel>
                                <Input
                                  placeholder="Deliverable name"
                                  value={deliverable.name}
                                  onChange={(e) => {
                                    const newDeliverables = [...field.value];
                                    newDeliverables[index].name = e.target.value;
                                    field.onChange(newDeliverables);
                                  }}
                                />
                              </div>

                              <div>
                                <FormLabel>Start Date</FormLabel>
                                <Input
                                  type="date"
                                  value={deliverable.startDate}
                                  onChange={(e) => {
                                    const newDeliverables = [...field.value];
                                    newDeliverables[index].startDate = e.target.value;
                                    field.onChange(newDeliverables);
                                  }}
                                />
                              </div>

                              <div>
                                <FormLabel>End Date</FormLabel>
                                <Input
                                  type="date"
                                  value={deliverable.endDate}
                                  onChange={(e) => {
                                    const newDeliverables = [...field.value];
                                    newDeliverables[index].endDate = e.target.value;
                                    field.onChange(newDeliverables);
                                  }}
                                />
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Button type="submit" className="w-full" disabled={saveProject.isPending}>
          {saveProject.isPending 
            ? (project ? "Updating..." : "Creating...") 
            : (project ? "Update Project" : "Create Project & Plan")
          }
        </Button>
      </form>
    </Form>
  );
}