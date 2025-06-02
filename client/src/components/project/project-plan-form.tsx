
import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Trash2 } from "lucide-react";
import type { ProjectPlan } from "@db/schema";

const deliverableSchema = z.object({
  name: z.string().min(1, "Deliverable name is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  assigneeId: z.string().optional(),
});

const projectPlanSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  status: z.string().optional(),
  deliverables: z.array(deliverableSchema).min(1, "At least one deliverable is required"),
});

type ProjectPlanFormData = z.infer<typeof projectPlanSchema>;

interface ProjectPlanFormProps {
  projectId: number;
  plan?: ProjectPlan & { deliverables?: any[] };
  onSuccess?: () => void;
}

export function ProjectPlanForm({ projectId, plan, onSuccess }: ProjectPlanFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ProjectPlanFormData>({
    resolver: zodResolver(projectPlanSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "draft",
      deliverables: [
        {
          name: "",
          description: "",
          startDate: "",
          endDate: "",
          assigneeId: "",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "deliverables",
  });

  // Fetch staff for assignee dropdown
  const { data: staff } = useQuery({
    queryKey: ["/api/staff"],
    queryFn: () => fetch("/api/staff").then(res => res.json()),
  });

  // Update form values when plan prop changes
  useEffect(() => {
    if (plan) {
      form.reset({
        name: plan.name || "",
        description: plan.description || "",
        startDate: plan.startDate ? new Date(plan.startDate).toISOString().split('T')[0] : "",
        endDate: plan.endDate ? new Date(plan.endDate).toISOString().split('T')[0] : "",
        status: plan.status || "draft",
        deliverables: plan.deliverables && plan.deliverables.length > 0 
          ? plan.deliverables.map((d: any) => ({
              name: d.name || "",
              description: d.description || "",
              startDate: d.startDate ? new Date(d.startDate).toISOString().split('T')[0] : "",
              endDate: d.endDate ? new Date(d.endDate).toISOString().split('T')[0] : "",
              assigneeId: d.assigneeId?.toString() || "",
            }))
          : [{
              name: "",
              description: "",
              startDate: "",
              endDate: "",
              assigneeId: "",
            }],
      });
    }
  }, [plan, form]);

  const savePlan = useMutation({
    mutationFn: async (data: ProjectPlanFormData) => {
      const formData = {
        name: data.name,
        description: data.description || "",
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status || "draft",
        deliverables: data.deliverables.map((d) => ({
          name: d.name,
          description: d.description || "",
          startDate: d.startDate,
          endDate: d.endDate,
          assigneeId: d.assigneeId && d.assigneeId !== "" ? parseInt(d.assigneeId) : null,
        })),
      };

      if (plan) {
        // Update existing plan
        const response = await fetch(`/api/project-plans/${plan.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const errorData = await response.text();
          try {
            const errorJson = JSON.parse(errorData);
            throw new Error(errorJson.error || "Failed to update project plan");
          } catch {
            throw new Error(`Failed to update project plan: ${response.status}`);
          }
        }

        return response.json();
      } else {
        // Create new plan
        const response = await fetch(`/api/projects/${projectId}/plans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const errorData = await response.text();
          try {
            const errorJson = JSON.parse(errorData);
            throw new Error(errorJson.error || "Failed to create project plan");
          } catch {
            throw new Error(`Failed to create project plan: ${response.status}`);
          }
        }

        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/plans`] });
      if (plan) {
        queryClient.invalidateQueries({ queryKey: [`/api/project-plans/${plan.id}`] });
      }
      toast({
        title: "Success",
        description: plan ? "Project plan updated successfully!" : "Project plan created successfully!",
      });
      if (!plan) {
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
    append({
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      assigneeId: "",
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => savePlan.mutate(data))} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
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
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Enter plan description" {...field} />
              </FormControl>
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
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Deliverable {index + 1}</h4>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => remove(index)}
                      variant="outline"
                      size="sm"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
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

                <FormField
                  control={form.control}
                  name={`deliverables.${index}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter deliverable description" {...field} />
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
                          <SelectItem value="">No assignee</SelectItem>
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

        <Button type="submit" className="w-full" disabled={savePlan.isPending}>
          {savePlan.isPending 
            ? (plan ? "Updating..." : "Creating...") 
            : (plan ? "Update Plan" : "Create Plan")
          }
        </Button>
      </form>
    </Form>
  );
}
