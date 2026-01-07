import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Trash2 } from "lucide-react";
import type { Project } from "@db/schema";

const deliverableSchema = z.object({
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  clientId: z.string().optional(),
  teamMembers: z.array(z.string()).optional().default([]),
  // Project plan fields (optional)
  createPlan: z.boolean().default(false),
  planName: z.string().optional(),
  planDescription: z.string().optional(),
  planStartDate: z.string().optional(),
  planEndDate: z.string().optional(),
  deliverables: z.array(deliverableSchema).optional().default([]),
}).superRefine((data, ctx) => {
  if (data.createPlan) {
    if (!data.planName || data.planName.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan name is required when creating a plan",
        path: ["planName"]
      });
    }
    if (!data.planStartDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan start date is required when creating a plan",
        path: ["planStartDate"]
      });
    }
    if (!data.planEndDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan end date is required when creating a plan",
        path: ["planEndDate"]
      });
    }
    if (!data.deliverables || data.deliverables.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one deliverable is required when creating a plan",
        path: ["deliverables"]
      });
    }
  }
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  project?: Project | null;
  onSuccess: () => void;
  restrictToSupportMaintenance?: boolean;
  isCustomerSupportOfficer?: boolean;
}

export function ProjectForm({ project, onSuccess, restrictToSupportMaintenance = false, isCustomerSupportOfficer = false }: ProjectFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing project members if editing a project
  const { data: existingMembers = [], isSuccess: membersLoaded } = useQuery({
    queryKey: [`/api/projects/${project?.id}/members`],
    queryFn: async () => {
      if (!project?.id) return [];
      const response = await fetch(`/api/projects/${project.id}/members`);
      if (!response.ok) {
        throw new Error("Failed to fetch project members");
      }
      return response.json();
    },
    enabled: !!project?.id,
  });

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name || "",
      description: project?.description || "",
      category: project?.category || (restrictToSupportMaintenance || isCustomerSupportOfficer ? "support_maintenance" : ""),
      startDate: project?.startDate ? new Date(project.startDate).toISOString().split('T')[0] : "",
      endDate: project?.endDate ? new Date(project.endDate).toISOString().split('T')[0] : "",
      clientId: project?.clientId?.toString() || "",
      teamMembers: [],
      createPlan: false,
      planName: "",
      planDescription: "",
      planStartDate: "",
      planEndDate: "",
      deliverables: [
        {
          name: "",
          startDate: "",
          endDate: "",
        }
      ],
    },
  });

  // Update form when existing members are loaded
  useEffect(() => {
    if (project?.id && membersLoaded && Array.isArray(existingMembers)) {
      const memberIds = existingMembers
        .map((member: any) => member.userId?.toString())
        .filter((id: string | undefined): id is string => id !== undefined);

      console.log('Setting team members:', memberIds);
      form.setValue('teamMembers', memberIds, { shouldValidate: false });
    }
  }, [membersLoaded, existingMembers, project?.id, form]);

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) {
        console.error("Failed to fetch clients:", res.status);
        return [];
      }
      return res.json();
    },
  });

  // Fetch staff and project managers for team members
  const { data: staff = [] } = useQuery({
    queryKey: ["/api/staff"],
    queryFn: async () => {
      const response = await fetch("/api/staff");
      if (!response.ok) {
        console.error("Failed to fetch staff:", response.status);
        return [];
      }
      const staffMembers = await response.json();

      // Also fetch project managers
      const pmResponse = await fetch("/api/users");
      if (pmResponse.ok) {
        const allUsers = await pmResponse.json();
        const projectManagers = allUsers.filter((u: any) => u.role === 'project_manager');
        return [...staffMembers, ...projectManagers];
      }

      return staffMembers;
    },
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

      // Critical check: If we have a project object with an ID, this is ALWAYS an update
      const isUpdate = project && project.id && typeof project.id === 'number';

      if (isUpdate) {
        // Update existing project - ensure we have a valid project ID
        console.log("UPDATING existing project with ID:", project.id, "Project object:", project);
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectData),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error("Failed to update project:", errorData);
          throw new Error(errorData || "Failed to update project");
        }

        savedProject = await response.json();
        console.log("Project updated successfully:", savedProject);

        // Ensure we got back a project with the same ID (not a new one)
        if (savedProject.id !== project.id) {
          console.error("WARNING: Updated project has different ID!", { expected: project.id, got: savedProject.id });
        }
      } else {
        // Create new project
        console.log("CREATING new project (no project ID found)");
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectData),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error("Failed to create project:", errorData);
          throw new Error(errorData || "Failed to create project");
        }

        savedProject = await response.json();
        console.log("Project created successfully:", savedProject);

        // Create project plan ONLY for new projects if user chose to create one
        if (data.createPlan && data.planName && data.planName.trim()) {
          const planData = {
            name: data.planName,
            description: data.planDescription || "",
            startDate: data.planStartDate,
            endDate: data.planEndDate,
            deliverables: data.deliverables || [],
          };

          const planResponse = await fetch(`/api/projects/${savedProject.id}/plans`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(planData),
          });

          if (!planResponse.ok) {
            const planError = await planResponse.text();
            throw new Error(`Failed to create project plan: ${planError}`);
          }
        }
      }

      return savedProject;
    },
    onSuccess: (savedProject) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/project-plans"] });
      const formData = form.getValues();
      toast({
        title: "Success",
        description: project 
          ? "Project updated successfully!" 
          : formData.createPlan 
            ? "Project and plan created successfully!" 
            : "Project created successfully!",
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
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value || (restrictToSupportMaintenance || isCustomerSupportOfficer ? "support_maintenance" : "")}
                      disabled={restrictToSupportMaintenance || isCustomerSupportOfficer}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {!restrictToSupportMaintenance && !isCustomerSupportOfficer && (
                          <>
                            <SelectItem value="website_development">Website Development</SelectItem>
                            <SelectItem value="dpl_outright">DPL Outright</SelectItem>
                            <SelectItem value="dpl_partnership">DPL Partnership</SelectItem>
                            <SelectItem value="direct_marketing">Direct Marketing</SelectItem>
                          </>
                        )}
                        <SelectItem value="support_maintenance">Support & Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                    {restrictToSupportMaintenance && (
                      <p className="text-sm text-muted-foreground">
                        Product owners can only create Support & Maintenance projects
                      </p>
                    )}
                    {isCustomerSupportOfficer && (
                      <p className="text-sm text-muted-foreground">
                        Customer support officers can only create Support & Maintenance projects
                      </p>
                    )}
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
                  <FormControl>
                    <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                      {staff && staff.length > 0 ? (
                        staff.map((member: any) => (
                          <div key={member.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`member-${member.id}`}
                              checked={field.value?.includes(member.id.toString()) || false}
                              onCheckedChange={(checked) => {
                                const currentValue = field.value || [];
                                if (checked) {
                                  field.onChange([...currentValue, member.id.toString()]);
                                } else {
                                  field.onChange(currentValue.filter((id: string) => id !== member.id.toString()));
                                }
                              }}
                            />
                            <label htmlFor={`member-${member.id}`} className="text-sm cursor-pointer">
                              {member.name} ({member.role === 'product_owner' ? 'Product Owner' : member.role === 'project_manager' ? 'Project Manager' : (member.specialization || member.role)})
                            </label>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No staff members available</p>
                      )}
                    </div>
                  </FormControl>
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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Project Plan (Optional)</h3>
                  <p className="text-sm text-muted-foreground">
                    You can create a plan now or add it later from the project details page
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="createPlan"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal">
                        Create plan now
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            </CardHeader>
            {form.watch("createPlan") && (
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
            )}
          </Card>
        )}

        <Button 
          type="submit" 
          className="w-full" 
          disabled={saveProject.isPending}
          onClick={() => {
            console.log("Form values on submit:", form.getValues());
            console.log("Form errors:", form.formState.errors);
          }}
        >
          {saveProject.isPending 
            ? (project ? "Updating..." : "Creating...") 
            : (project ? "Update Project" : form.watch("createPlan") ? "Create Project & Plan" : "Create Project")
          }
        </Button>
      </form>
    </Form>
  );
}