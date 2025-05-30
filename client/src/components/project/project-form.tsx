import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { User, Project } from "@db/schema";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.enum([
    "website_development",
    "dpl_outright",
    "dpl_partnership",
    "direct_marketing",
    "support_maintenance"
  ]),
  clientType: z.enum(["existing", "new"]),
  clientId: z.number().optional(),
  clientEmail: z.string().email().optional(),
  teamMembers: z.array(z.number()).default([]),
  startDate: z.date(),
  endDate: z.date(),
}).refine(data => {
  if (data.clientType === "existing") {
    return data.clientId !== undefined;
  } else {
    return data.clientEmail !== undefined;
  }
}, {
  message: "Please either select an existing client or provide a client email"
});

type ProjectFormValues = z.infer<typeof projectSchema>;

export function ProjectForm({ project, onSuccess }: { project?: Project; onSuccess?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [clientType, setClientType] = useState<"existing" | "new">("existing");
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);

  // Fetch available clients with proper typing
  const { data: clients, isLoading: isLoadingClients } = useQuery<User[]>({
    queryKey: ["/api/clients"],
  });

  // Fetch available staff members
  const { data: staffMembers, isLoading: isLoadingStaff } = useQuery<User[]>({
    queryKey: ["/api/staff"],
  });

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name || "",
      description: project?.description || "",
      clientType: project?.clientId ? "existing" : "new",
      clientId: project?.clientId || undefined,
      clientEmail: project?.pendingClientEmail || "",
      category: project?.category || undefined,
      teamMembers: [],
      startDate: project?.startDate ? new Date(project.startDate) : undefined,
      endDate: project?.endDate ? new Date(project.endDate) : undefined,
    },
  });

  // Set the client type state when editing a project - use useEffect instead of useState
  React.useEffect(() => {
    if (project) {
      const initialClientType = project.clientId ? "existing" : "new";
      setClientType(initialClientType);
      
      // Reset form with proper values when project changes
      form.reset({
        name: project.name || "",
        description: project.description || "",
        clientType: initialClientType,
        clientId: project.clientId || undefined,
        clientEmail: project.pendingClientEmail || "",
        category: project.category || undefined,
        teamMembers: [],
        startDate: project.startDate ? new Date(project.startDate) : undefined,
        endDate: project.endDate ? new Date(project.endDate) : undefined,
      });
    }
  }, [project, form]);

  const saveProject = useMutation({
    mutationFn: async (data: ProjectFormValues) => {
      if (!data.startDate || !data.endDate) {
        throw new Error("Start and end dates are required");
      }

      // Prepare the request body based on client type
      const requestBody = {
        name: data.name,
        description: data.description,
        type: "web_development", // Default type since we removed the selection
        category: data.category,
        teamMembers: data.teamMembers,
        // Ensure dates are properly formatted as ISO strings
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
        ...(data.clientType === "existing"
          ? { clientId: data.clientId }
          : { pendingClientEmail: data.clientEmail }
        ),
      };

      const url = project ? `/api/projects/${project.id}` : "/api/projects";
      const method = project ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: project ? "Project updated successfully" : "Project created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
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

  const addTeamMember = (staffMember: User) => {
    if (!selectedMembers.find(member => member.id === staffMember.id)) {
      const newMembers = [...selectedMembers, staffMember];
      setSelectedMembers(newMembers);
      form.setValue("teamMembers", newMembers.map(member => member.id));
    }
  };

  const removeTeamMember = (staffId: number) => {
    const newMembers = selectedMembers.filter(member => member.id !== staffId);
    setSelectedMembers(newMembers);
    form.setValue("teamMembers", newMembers.map(member => member.id));
  };

  const onSubmit = (data: ProjectFormValues) => {
    saveProject.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
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
                  placeholder="Describe the project requirements"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4">
          <FormLabel>Add Team Members</FormLabel>
          
          {/* Selected team members */}
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-md">
              {selectedMembers.map((member) => (
                <Badge key={member.id} variant="secondary" className="flex items-center gap-1">
                  {member.name}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => removeTeamMember(member.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}

          {/* Staff selection dropdown */}
          <Select onValueChange={(value) => {
            const staffMember = staffMembers?.find(staff => staff.id.toString() === value);
            if (staffMember) {
              addTeamMember(staffMember);
            }
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Select staff members to add" />
            </SelectTrigger>
            <SelectContent>
              {isLoadingStaff ? (
                <div className="flex items-center justify-center p-4">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : staffMembers && staffMembers.length > 0 ? (
                staffMembers
                  .filter(staff => !selectedMembers.find(member => member.id === staff.id))
                  .map((staff) => (
                    <SelectItem key={staff.id} value={staff.id.toString()}>
                      <div className="flex flex-col">
                        <span>{staff.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {staff.specialization || staff.role}
                        </span>
                      </div>
                    </SelectItem>
                  ))
              ) : (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  No staff members available
                </div>
              )}
            </SelectContent>
          </Select>
          
          <FormDescription>
            Select staff members to add to this project. You can add more members later.
          </FormDescription>
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project category" />
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
          name="clientType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client Selection</FormLabel>
              <Tabs
                value={clientType}
                onValueChange={(value) => {
                  field.onChange(value);
                  setClientType(value as "existing" | "new");
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="existing">Existing Client</TabsTrigger>
                  <TabsTrigger value="new">New Client</TabsTrigger>
                </TabsList>
                <TabsContent value="existing">
                  <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        {isLoadingClients ? (
                          <div className="flex items-center justify-center p-4">
                            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                          </div>
                        ) : clients && clients.length > 0 ? (
                          <Select 
                            value={field.value ? field.value.toString() : ""} 
                            onValueChange={(value) => field.onChange(parseInt(value))}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a client" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {clients.map((client) => (
                                <SelectItem key={client.id} value={client.id.toString()}>
                                  {client.name} ({client.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm text-muted-foreground p-4 text-center">
                            No clients available. Use the "New Client" tab to invite a client by email.
                          </div>
                        )}
                        <FormDescription>
                          Select from existing client accounts
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                <TabsContent value="new">
                  <FormField
                    control={form.control}
                    name="clientEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="Enter client's email address"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          An invitation will be sent to this email address
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date < new Date() ||
                        (form.getValues("startDate") &&
                          date < form.getValues("startDate"))
                      }
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full mt-4" disabled={saveProject.isPending}>
          {saveProject.isPending ? (project ? "Updating..." : "Creating...") : (project ? "Update Project" : "Create Project")}
        </Button>
      </form>
    </Form>
  );
}