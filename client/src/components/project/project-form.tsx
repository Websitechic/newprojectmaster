
import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Plus, Trash2, CheckCircle } from "lucide-react";
import type { Project } from "@db/schema";

const deliverableSchema = z.object({
  name: z.string().min(1, "Deliverable name is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  assigneeId: z.string().optional(),
});

const projectSchema = z.object({
  // Project details
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  clientId: z.string().optional(),
  teamMembers: z.array(z.string()).optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  
  // Project plan details
  planName: z.string().min(1, "Plan name is required"),
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
  const [activeTab, setActiveTab] = useState("details");
  const [detailsCompleted, setDetailsCompleted] = useState(false);
  const [planCompleted, setPlanCompleted] = useState(false);

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      clientId: "",
      teamMembers: [],
      startDate: "",
      endDate: "",
      planName: "",
      deliverables: [
        {
          name: "",
          description: "",
          startDate: "",
          endDate: "",
          assigneeId: "none",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "deliverables",
  });

  // Watch form values to check completion
  const watchedValues = form.watch();

  // Check if project details tab is completed
  useEffect(() => {
    const isDetailsComplete = 
      watchedValues.name &&
      watchedValues.category &&
      watchedValues.startDate &&
      watchedValues.endDate;
    setDetailsCompleted(!!isDetailsComplete);
  }, [watchedValues.name, watchedValues.category, watchedValues.startDate, watchedValues.endDate]);

  // Check if project plan tab is completed
  useEffect(() => {
    const isPlanComplete = 
      watchedValues.planName &&
      watchedValues.deliverables?.length > 0 &&
      watchedValues.deliverables.every(d => d.name?.trim() && d.startDate && d.endDate);
    setPlanCompleted(!!isPlanComplete);
  }, [watchedValues.planName, watchedValues.deliverables]);

  // Fetch clients for the dropdown
  const { data: clients } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: () => fetch("/api/clients").then(res => res.json()),
  });

  // Fetch staff for team members and assignees
  const { data: staff } = useQuery({
    queryKey: ["/api/staff"],
    queryFn: () => fetch("/api/staff").then(res => res.json()),
  });

  const saveProject = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      // Prepare the project data
      const projectData = {
        name: data.name,
        description: data.description || "",
        category: data.category,
        clientId: data.clientId && data.clientId !== "" && data.clientId !== "none" ? parseInt(data.clientId) : null,
        teamMembers: data.teamMembers?.map(id => parseInt(id)) || [],
        startDate: data.startDate,
        endDate: data.endDate,
        type: "web_development",
      };

      console.log("Submitting project data:", projectData);

      // Create the project first
      const projectResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(projectData),
      });

      if (!projectResponse.ok) {
        const errorData = await projectResponse.text();
        console.error("Create project error response:", errorData);
        try {
          const errorJson = JSON.parse(errorData);
          throw new Error(errorJson.error || "Failed to create project");
        } catch {
          throw new Error(`Failed to create project: ${projectResponse.status} ${projectResponse.statusText}`);
        }
      }

      const createdProject = await projectResponse.json();

      // Now create the project plan
      const planData = {
        name: data.planName,
        description: "",
        startDate: data.startDate,
        endDate: data.endDate,
        status: "draft",
        deliverables: data.deliverables.map(d => ({
          name: d.name,
          description: "",
          startDate: d.startDate,
          endDate: d.endDate,
          assigneeId: d.assigneeId && d.assigneeId !== "none" ? parseInt(d.assigneeId) : null,
        })),
      };

      const planResponse = await fetch(`/api/projects/${createdProject.id}/plans`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(planData),
      });

      if (!planResponse.ok) {
        const errorData = await planResponse.text();
        console.error("Create plan error response:", errorData);
        try {
          const errorJson = JSON.parse(errorData);
          throw new Error(errorJson.error || "Failed to create project plan");
        } catch {
          throw new Error(`Failed to create project plan: ${planResponse.status} ${planResponse.statusText}`);
        }
      }

      return createdProject;
    },
    onSuccess: (data) => {
      console.log("Project and plan created successfully:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Success",
        description: "Project and project plan created successfully!",
      });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      console.error("Project creation error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addDeliverable = () => {
    append({
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      assigneeId: "none",
    });
  };

  const canCreateProject = detailsCompleted && planCompleted && !project;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => saveProject.mutate(data))} className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details" className="flex items-center gap-2">
              {detailsCompleted && <CheckCircle className="h-4 w-4 text-green-500" />}
              Project Details
            </TabsTrigger>
            <TabsTrigger value="plan" className="flex items-center gap-2">
              {planCompleted && <CheckCircle className="h-4 w-4 text-green-500" />}
              Project Plan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
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

            <div className="flex justify-end">
              <Button 
                type="button" 
                onClick={() => setActiveTab("plan")}
                disabled={!detailsCompleted}
              >
                Next: Project Plan
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="plan" className="space-y-6">
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

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Deliverables</h3>
                <Button type="button" onClick={addDeliverable} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Deliverable
                </Button>
              </div>

              {fields.map((field, index) => (
                <Card key={field.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <h4 className="text-sm font-medium">Deliverable {index + 1}</h4>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name={`deliverables.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Deliverable Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter deliverable name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`deliverables.${index}.startDate`}
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
                        name={`deliverables.${index}.endDate`}
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
                      name={`deliverables.${index}.assigneeId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assignee (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select assignee" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No assignee</SelectItem>
                              {staff?.map((member: any) => (
                                <SelectItem key={member.id} value={member.id.toString()}>
                                  {member.name} ({member.specialization})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-between">
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setActiveTab("details")}
              >
                Back to Details
              </Button>
              
              <Button 
                type="submit" 
                disabled={!canCreateProject || saveProject.isPending}
              >
                {saveProject.isPending ? "Creating..." : "Create Project & Plan"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {project && (
          <Button type="submit" className="w-full mt-4" disabled={saveProject.isPending}>
            {saveProject.isPending ? "Updating..." : "Update Project"}
          </Button>
        )}
      </form>
    </Form>
  );
}
