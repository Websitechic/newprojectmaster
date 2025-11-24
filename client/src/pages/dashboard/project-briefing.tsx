
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  FileText, 
  Save,
  X,
  Briefcase,
  AlertCircle,
  Link,
  Eye
} from "lucide-react";

interface ProjectBriefing {
  id: number;
  projectName: string;
  clientName: string;
  projectType: string;
  description: string;
  objectives: string;
  scope: string;
  timeline: string;
  budget?: string;
  deliverables: string;
  technicalRequirements?: string;
  referenceLinks?: string;
  additionalNotes?: string;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export default function ProjectBriefingPage() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingBriefing, setEditingBriefing] = useState<ProjectBriefing | null>(null);
  const [selectedBriefingId, setSelectedBriefingId] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    projectName: "",
    clientName: "",
    projectType: "",
    description: "",
    objectives: "",
    scope: "",
    timeline: "",
    budget: "",
    deliverables: "",
    technicalRequirements: "",
    referenceLinks: "",
    additionalNotes: ""
  });

  // Check if user has access
  const hasAccess = user?.role === "project_manager" || 
                    user?.role === "operations_manager" || 
                    user?.specialization === "operations_manager" ||
                    user?.role === "customer_support_officer" ||
                    user?.role === "team_lead";

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full">
        <Sidebar currentPath="/dashboard/project-briefing" />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header />
          <div className="flex-1 flex items-center justify-center w-full">
            <div className="text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-gray-600">Only project managers, operations managers, customer support officers, and team leads can access project briefings.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fetch project briefings
  const { data: briefings = [], isLoading, error } = useQuery<ProjectBriefing[]>({
    queryKey: ["/api/project-briefings", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);

      const response = await fetch(`/api/project-briefings?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch project briefings");
      }
      return response.json();
    },
  });

  // Create briefing mutation
  const createBriefingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/project-briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create project briefing");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-briefings"] });
      setShowCreateForm(false);
      resetForm();
      toast({
        title: "Success",
        description: "Project briefing created successfully",
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

  // Update briefing mutation
  const updateBriefingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await fetch(`/api/project-briefings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update project briefing");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-briefings"] });
      setShowEditForm(false);
      setEditingBriefing(null);
      resetForm();
      toast({
        title: "Success",
        description: "Project briefing updated successfully",
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

  // Delete briefing mutation
  const deleteBriefingMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/project-briefings/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete project briefing");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-briefings"] });
      toast({
        title: "Success",
        description: "Project briefing deleted successfully",
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

  // Helper functions
  const resetForm = () => {
    setFormData({
      projectName: "",
      clientName: "",
      projectType: "",
      description: "",
      objectives: "",
      scope: "",
      timeline: "",
      budget: "",
      deliverables: "",
      technicalRequirements: "",
      referenceLinks: "",
      additionalNotes: ""
    });
  };

  const handleCreateBriefing = () => {
    if (!formData.projectName || !formData.clientName || !formData.projectType || !formData.description) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createBriefingMutation.mutate(formData);
  };

  const handleUpdateBriefing = () => {
    if (!editingBriefing || !formData.projectName || !formData.clientName || !formData.projectType || !formData.description) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    updateBriefingMutation.mutate({
      id: editingBriefing.id,
      data: formData
    });
  };

  const startEdit = (briefing: ProjectBriefing) => {
    setEditingBriefing(briefing);
    setFormData({
      projectName: briefing.projectName,
      clientName: briefing.clientName,
      projectType: briefing.projectType,
      description: briefing.description,
      objectives: briefing.objectives,
      scope: briefing.scope,
      timeline: briefing.timeline,
      budget: briefing.budget || "",
      deliverables: briefing.deliverables,
      technicalRequirements: briefing.technicalRequirements || "",
      referenceLinks: briefing.referenceLinks || "",
      additionalNotes: briefing.additionalNotes || ""
    });
    setShowEditForm(true);
  };

  const filteredBriefings = briefings.filter(briefing =>
    briefing.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    briefing.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const BriefingForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Project Name *
          </label>
          <Input
            value={formData.projectName}
            onChange={(e) => setFormData(prev => ({ ...prev, projectName: e.target.value }))}
            placeholder="Enter project name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Client Name *
          </label>
          <Input
            value={formData.clientName}
            onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
            placeholder="Enter client name"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Project Type *
        </label>
        <Input
          value={formData.projectType}
          onChange={(e) => setFormData(prev => ({ ...prev, projectType: e.target.value }))}
          placeholder="e.g., Website Development, Mobile App, etc."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Project Description *
        </label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Detailed description of the project"
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Project Objectives
        </label>
        <Textarea
          value={formData.objectives}
          onChange={(e) => setFormData(prev => ({ ...prev, objectives: e.target.value }))}
          placeholder="What are the main objectives of this project?"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Project Scope
        </label>
        <Textarea
          value={formData.scope}
          onChange={(e) => setFormData(prev => ({ ...prev, scope: e.target.value }))}
          placeholder="Define what is included and excluded from the project"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timeline
          </label>
          <Input
            value={formData.timeline}
            onChange={(e) => setFormData(prev => ({ ...prev, timeline: e.target.value }))}
            placeholder="e.g., 3 months, Q1 2024"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Budget (Optional)
          </label>
          <Input
            value={formData.budget}
            onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))}
            placeholder="e.g., $10,000 - $15,000"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Deliverables
        </label>
        <Textarea
          value={formData.deliverables}
          onChange={(e) => setFormData(prev => ({ ...prev, deliverables: e.target.value }))}
          placeholder="List the expected deliverables"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Technical Requirements (Optional)
        </label>
        <Textarea
          value={formData.technicalRequirements}
          onChange={(e) => setFormData(prev => ({ ...prev, technicalRequirements: e.target.value }))}
          placeholder="Any specific technical requirements or constraints"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Reference Links (Optional)
        </label>
        <Textarea
          value={formData.referenceLinks}
          onChange={(e) => setFormData(prev => ({ ...prev, referenceLinks: e.target.value }))}
          placeholder="Paste any reference links (one per line)"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Additional Notes (Optional)
        </label>
        <Textarea
          value={formData.additionalNotes}
          onChange={(e) => setFormData(prev => ({ ...prev, additionalNotes: e.target.value }))}
          placeholder="Any other important information"
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => {
            if (isEdit) {
              setShowEditForm(false);
              setEditingBriefing(null);
            } else {
              setShowCreateForm(false);
            }
            resetForm();
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleUpdateBriefing : handleCreateBriefing}
          disabled={isEdit ? updateBriefingMutation.isPending : createBriefingMutation.isPending}
        >
          <Save size={16} className="mr-1" />
          {isEdit 
            ? (updateBriefingMutation.isPending ? "Updating..." : "Update Briefing")
            : (createBriefingMutation.isPending ? "Creating..." : "Create Briefing")
          }
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full max-w-none">
      <Sidebar currentPath="/dashboard/project-briefing" />
      <div className="flex-1 flex flex-col overflow-hidden w-full max-w-none">
        <Header />
        <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 w-full max-w-none">
          <div className="w-full max-w-none space-y-4 lg:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <Briefcase className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
                  New Project Briefings
                </h1>
                <p className="text-gray-600 mt-1 text-sm md:text-base">
                  Create and manage project briefings for new projects
                </p>
              </div>
              <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Plus size={16} />
                    Create New Briefing
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Project Briefing</DialogTitle>
                    <DialogDescription>
                      Fill in the details for the new project briefing
                    </DialogDescription>
                  </DialogHeader>
                  <BriefingForm />
                </DialogContent>
              </Dialog>
            </div>

            {/* Search */}
            <Card className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search briefings by project or client name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </Card>

            {/* Content */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500">Loading project briefings...</div>
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>Failed to load project briefings. Please try again.</AlertDescription>
              </Alert>
            ) : filteredBriefings.length === 0 ? (
              <Card className="p-12 text-center">
                <Briefcase className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Project Briefings Found</h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm 
                    ? "No briefings match your search." 
                    : "Get started by creating your first project briefing."
                  }
                </p>
                {!searchTerm && (
                  <Button onClick={() => setShowCreateForm(true)}>
                    <Plus size={16} className="mr-1" />
                    Create First Briefing
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredBriefings.map((briefing) => (
                  <Card key={briefing.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-600" />
                            {briefing.projectName}
                          </CardTitle>
                          <CardDescription className="mt-2">
                            <span className="font-medium">Client:</span> {briefing.clientName} • 
                            <span className="font-medium ml-2">Type:</span> {briefing.projectType} • 
                            <span className="ml-2">Created by {briefing.createdByName}</span> • 
                            <span className="ml-2">{new Date(briefing.createdAt).toLocaleDateString()}</span>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedBriefingId(selectedBriefingId === briefing.id ? null : briefing.id)}
                          >
                            <Eye size={16} className="mr-1" />
                            {selectedBriefingId === briefing.id ? "Hide" : "View"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEdit(briefing)}
                          >
                            <Edit size={16} className="mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this briefing?")) {
                                deleteBriefingMutation.mutate(briefing.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {selectedBriefingId === briefing.id && (
                      <CardContent className="pt-0">
                        <Separator className="mb-4" />
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                            <p className="text-gray-700 whitespace-pre-wrap">{briefing.description}</p>
                          </div>

                          {briefing.objectives && (
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">Objectives</h4>
                              <p className="text-gray-700 whitespace-pre-wrap">{briefing.objectives}</p>
                            </div>
                          )}

                          {briefing.scope && (
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">Scope</h4>
                              <p className="text-gray-700 whitespace-pre-wrap">{briefing.scope}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {briefing.timeline && (
                              <div>
                                <h4 className="font-medium text-gray-900 mb-2">Timeline</h4>
                                <p className="text-gray-700">{briefing.timeline}</p>
                              </div>
                            )}

                            {briefing.budget && (
                              <div>
                                <h4 className="font-medium text-gray-900 mb-2">Budget</h4>
                                <p className="text-gray-700">{briefing.budget}</p>
                              </div>
                            )}
                          </div>

                          {briefing.deliverables && (
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">Deliverables</h4>
                              <p className="text-gray-700 whitespace-pre-wrap">{briefing.deliverables}</p>
                            </div>
                          )}

                          {briefing.technicalRequirements && (
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">Technical Requirements</h4>
                              <p className="text-gray-700 whitespace-pre-wrap">{briefing.technicalRequirements}</p>
                            </div>
                          )}

                          {briefing.referenceLinks && (
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">Reference Links</h4>
                              <div className="space-y-1">
                                {briefing.referenceLinks.split('\n').filter(link => link.trim()).map((link, index) => (
                                  <a
                                    key={index}
                                    href={link.trim()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm"
                                  >
                                    <Link size={14} />
                                    {link.trim()}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {briefing.additionalNotes && (
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">Additional Notes</h4>
                              <p className="text-gray-700 whitespace-pre-wrap">{briefing.additionalNotes}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {/* Edit Dialog */}
            <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Project Briefing</DialogTitle>
                  <DialogDescription>
                    Update the project briefing details
                  </DialogDescription>
                </DialogHeader>
                <BriefingForm isEdit={true} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
