
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  FileText, 
  Upload, 
  Save,
  X,
  BookOpen,
  Building,
  AlertCircle,
  File,
  ExternalLink,
  Link,
  Eye
} from "lucide-react";

interface SopSegment {
  id?: number;
  title: string;
  content: string;
  fileUrl?: string;
  segmentOrder: number;
  fileName?: string;
}

interface Sop {
  id: number;
  title: string;
  department: string;
  referenceLink?: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  segments: SopSegment[];
}

export default function SOPPage() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingSop, setEditingSop] = useState<Sop | null>(null);
  const [selectedSopId, setSelectedSopId] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    department: "",
    referenceLink: "",
    segments: [{ title: "", content: "", fileUrl: "", fileName: "" }] as SopSegment[]
  });

  // Check if user is operations manager
  const isOperationsManager = user?.role === "operations_manager" || user?.specialization === "operations_manager";

  if (!isOperationsManager) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard/sop" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-gray-600">Only operations managers can access SOP management.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fetch SOPs
  const { data: sops = [], isLoading, error } = useQuery<Sop[]>({
    queryKey: ["/api/sops", selectedDepartment, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedDepartment !== "all") params.append("department", selectedDepartment);
      if (searchTerm) params.append("search", searchTerm);

      const response = await fetch(`/api/sops?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch SOPs");
      }
      return response.json();
    },
  });

  // Fetch departments
  const { data: departments = [] } = useQuery<string[]>({
    queryKey: ["/api/sops/departments"],
    queryFn: async () => {
      const response = await fetch("/api/sops/departments");
      if (!response.ok) {
        throw new Error("Failed to fetch departments");
      }
      return response.json();
    },
  });

  // Create SOP mutation
  const createSopMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/sops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create SOP");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sops"] });
      setShowCreateForm(false);
      resetForm();
      toast({
        title: "Success",
        description: "SOP created successfully",
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

  // Update SOP mutation
  const updateSopMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await fetch(`/api/sops/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update SOP");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sops"] });
      setShowEditForm(false);
      setEditingSop(null);
      resetForm();
      toast({
        title: "Success",
        description: "SOP updated successfully",
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

  // Delete SOP mutation
  const deleteSopMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/sops/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete SOP");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sops"] });
      toast({
        title: "Success",
        description: "SOP deleted successfully",
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

  // File upload mutation
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/sops/upload-file", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload file");
      }
      return response.json();
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
      title: "",
      department: "",
      referenceLink: "",
      segments: [{ title: "", content: "", fileUrl: "", fileName: "" }]
    });
  };

  const addSegment = () => {
    setFormData(prev => ({
      ...prev,
      segments: [...prev.segments, { title: "", content: "", fileUrl: "", fileName: "" }]
    }));
  };

  const removeSegment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      segments: prev.segments.filter((_, i) => i !== index)
    }));
  };

  const updateSegment = (index: number, field: keyof SopSegment, value: string) => {
    setFormData(prev => ({
      ...prev,
      segments: prev.segments.map((segment, i) => 
        i === index ? { ...segment, [field]: value } : segment
      )
    }));
  };

  const handleFileUpload = async (index: number, file: File) => {
    try {
      const result = await uploadFileMutation.mutateAsync(file);
      updateSegment(index, "fileUrl", result.fileUrl);
      updateSegment(index, "fileName", result.fileName);
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const handleCreateSop = () => {
    if (!formData.title || !formData.department || formData.segments.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Validate segments
    const invalidSegments = formData.segments.some(segment => !segment.title || !segment.content);
    if (invalidSegments) {
      toast({
        title: "Error",
        description: "All segments must have a title and content",
        variant: "destructive",
      });
      return;
    }

    createSopMutation.mutate({
      title: formData.title,
      department: formData.department,
      referenceLink: formData.referenceLink,
      segments: formData.segments.map((segment, index) => ({
        ...segment,
        segmentOrder: index
      }))
    });
  };

  const handleUpdateSop = () => {
    if (!editingSop || !formData.title || !formData.department || formData.segments.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Validate segments
    const invalidSegments = formData.segments.some(segment => !segment.title || !segment.content);
    if (invalidSegments) {
      toast({
        title: "Error",
        description: "All segments must have a title and content",
        variant: "destructive",
      });
      return;
    }

    updateSopMutation.mutate({
      id: editingSop.id,
      data: {
        title: formData.title,
        department: formData.department,
        referenceLink: formData.referenceLink,
        segments: formData.segments.map((segment, index) => ({
          ...segment,
          segmentOrder: index
        }))
      }
    });
  };

  const startEdit = (sop: Sop) => {
    setEditingSop(sop);
    setFormData({
      title: sop.title,
      department: sop.department,
      referenceLink: sop.referenceLink || "",
      segments: sop.segments.map(segment => ({
        ...segment,
        fileName: segment.fileUrl ? segment.fileUrl.split('/').pop() : ""
      }))
    });
    setShowEditForm(true);
  };

  // Group SOPs by department
  const sopsByDepartment = sops.reduce((acc, sop) => {
    if (!acc[sop.department]) {
      acc[sop.department] = [];
    }
    acc[sop.department].push(sop);
    return acc;
  }, {} as Record<string, Sop[]>);

  const filteredSops = selectedDepartment === "all" ? sopsByDepartment : 
    { [selectedDepartment]: sopsByDepartment[selectedDepartment] || [] };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath="/dashboard/sop" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
                  Standard Operating Procedures
                </h1>
                <p className="text-gray-600 mt-1 text-sm md:text-base">
                  Create and manage department SOPs with organized segments, reference links, and file attachments
                </p>
              </div>
              <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Plus size={16} />
                    Create New SOP
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New SOP</DialogTitle>
                    <DialogDescription>
                      Create a new Standard Operating Procedure with organized segments and reference links
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          SOP Title *
                        </label>
                        <Input
                          value={formData.title}
                          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="Enter SOP title"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Department *
                        </label>
                        <Select
                          value={formData.department}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept} value={dept}>
                                {dept}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Reference Link */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Reference Link (Optional)
                      </label>
                      <Input
                        type="url"
                        value={formData.referenceLink}
                        onChange={(e) => setFormData(prev => ({ ...prev, referenceLink: e.target.value }))}
                        placeholder="https://example.com/reference"
                      />
                    </div>

                    {/* Segments */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-gray-900">SOP Segments</h3>
                        <Button onClick={addSegment} size="sm" variant="outline">
                          <Plus size={16} className="mr-1" />
                          Add Segment
                        </Button>
                      </div>
                      
                      <div className="space-y-4">
                        {formData.segments.map((segment, index) => (
                          <Card key={index} className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-gray-900">Segment {index + 1}</h4>
                              {formData.segments.length > 1 && (
                                <Button
                                  onClick={() => removeSegment(index)}
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X size={16} />
                                </Button>
                              )}
                            </div>
                            
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Segment Title *
                                </label>
                                <Input
                                  value={segment.title}
                                  onChange={(e) => updateSegment(index, "title", e.target.value)}
                                  placeholder="Enter segment title"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Content *
                                </label>
                                <Textarea
                                  value={segment.content}
                                  onChange={(e) => updateSegment(index, "content", e.target.value)}
                                  placeholder="Enter segment content"
                                  rows={4}
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Attachment (Optional)
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="file"
                                    id={`file-${index}`}
                                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        handleFileUpload(index, file);
                                      }
                                    }}
                                    className="hidden"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => document.getElementById(`file-${index}`)?.click()}
                                  >
                                    <Upload size={16} className="mr-1" />
                                    Upload File
                                  </Button>
                                  {segment.fileName && (
                                    <span className="text-sm text-gray-600 flex items-center">
                                      <File size={14} className="mr-1" />
                                      {segment.fileName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowCreateForm(false);
                          resetForm();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateSop}
                        disabled={createSopMutation.isPending}
                      >
                        <Save size={16} className="mr-1" />
                        {createSopMutation.isPending ? "Creating..." : "Create SOP"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Filters */}
            <Card className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <Input
                      placeholder="Search SOPs by keyword..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="w-full sm:w-64">
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            {/* Content */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500">Loading SOPs...</div>
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>Failed to load SOPs. Please try again.</AlertDescription>
              </Alert>
            ) : Object.keys(filteredSops).length === 0 ? (
              <Card className="p-12 text-center">
                <BookOpen className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No SOPs Found</h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm || selectedDepartment !== "all" 
                    ? "No SOPs match your current filters." 
                    : "Get started by creating your first SOP."
                  }
                </p>
                {(!searchTerm && selectedDepartment === "all") && (
                  <Button onClick={() => setShowCreateForm(true)}>
                    <Plus size={16} className="mr-1" />
                    Create First SOP
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-6">
                <Accordion type="multiple" className="w-full space-y-4">
                  {Object.entries(filteredSops).map(([department, departmentSops]) => (
                    departmentSops && departmentSops.length > 0 && (
                      <AccordionItem key={department} value={department} className="border rounded-lg">
                        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-gray-50">
                          <div className="flex items-center gap-3 text-left">
                            <Building className="h-5 w-5 text-blue-600" />
                            <div>
                              <h2 className="text-xl font-semibold text-gray-900">{department}</h2>
                              <p className="text-sm text-gray-500 mt-1">
                                {departmentSops.length} SOP{departmentSops.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-4">
                          <div className="grid gap-4">
                            {departmentSops.map((sop) => (
                              <Card key={sop.id} className="hover:shadow-md transition-shadow">
                                <CardHeader className="pb-3">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <CardTitle className="text-lg flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-blue-600" />
                                        {sop.title}
                                      </CardTitle>
                                      <CardDescription className="mt-2">
                                        {sop.segments.length} segment{sop.segments.length !== 1 ? 's' : ''} • 
                                        Updated {new Date(sop.updatedAt).toLocaleDateString()}
                                        {sop.referenceLink && (
                                          <>
                                            {' • '}
                                            <a
                                              href={sop.referenceLink}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                                            >
                                              <Link size={12} />
                                              Reference Link
                                              <ExternalLink size={10} />
                                            </a>
                                          </>
                                        )}
                                      </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2 ml-4">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setSelectedSopId(selectedSopId === sop.id ? null : sop.id)}
                                      >
                                        <Eye size={16} className="mr-1" />
                                        {selectedSopId === sop.id ? "Hide" : "View"}
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => startEdit(sop)}
                                      >
                                        <Edit size={16} className="mr-1" />
                                        Edit
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          if (confirm("Are you sure you want to delete this SOP?")) {
                                            deleteSopMutation.mutate(sop.id);
                                          }
                                        }}
                                        className="text-red-600 hover:text-red-700"
                                      >
                                        <Trash2 size={16} />
                                      </Button>
                                    </div>
                                  </div>
                                </CardHeader>
                                
                                {selectedSopId === sop.id && (
                                  <CardContent className="pt-0">
                                    <Separator className="mb-4" />
                                    <div className="space-y-4">
                                      {sop.segments.map((segment, index) => (
                                        <Card key={segment.id || index} className="p-4 bg-gray-50">
                                          <div className="flex items-start justify-between mb-2">
                                            <h4 className="font-medium text-gray-900 flex items-center gap-2">
                                              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                                                Step {index + 1}
                                              </span>
                                              {segment.title}
                                            </h4>
                                            {segment.fileUrl && (
                                              <a
                                                href={segment.fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm"
                                              >
                                                <File size={14} />
                                                View Attachment
                                              </a>
                                            )}
                                          </div>
                                          <p className="text-gray-700 whitespace-pre-wrap">{segment.content}</p>
                                        </Card>
                                      ))}
                                    </div>
                                  </CardContent>
                                )}
                              </Card>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  ))}
                </Accordion>
              </div>
            )}

            {/* Edit Dialog - Same structure as Create but for editing */}
            <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit SOP</DialogTitle>
                  <DialogDescription>
                    Update the Standard Operating Procedure and its segments
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SOP Title *
                      </label>
                      <Input
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Enter SOP title"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Department *
                      </label>
                      <Select
                        value={formData.department}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept} value={dept}>
                              {dept}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Reference Link */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reference Link (Optional)
                    </label>
                    <Input
                      type="url"
                      value={formData.referenceLink}
                      onChange={(e) => setFormData(prev => ({ ...prev, referenceLink: e.target.value }))}
                      placeholder="https://example.com/reference"
                    />
                  </div>

                  {/* Segments */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">SOP Segments</h3>
                      <Button onClick={addSegment} size="sm" variant="outline">
                        <Plus size={16} className="mr-1" />
                        Add Segment
                      </Button>
                    </div>
                    
                    <div className="space-y-4">
                      {formData.segments.map((segment, index) => (
                        <Card key={index} className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-gray-900">Segment {index + 1}</h4>
                            {formData.segments.length > 1 && (
                              <Button
                                onClick={() => removeSegment(index)}
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                              >
                                <X size={16} />
                              </Button>
                            )}
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Segment Title *
                              </label>
                              <Input
                                value={segment.title}
                                onChange={(e) => updateSegment(index, "title", e.target.value)}
                                placeholder="Enter segment title"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Content *
                              </label>
                              <Textarea
                                value={segment.content}
                                onChange={(e) => updateSegment(index, "content", e.target.value)}
                                placeholder="Enter segment content"
                                rows={4}
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Attachment (Optional)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="file"
                                  id={`edit-file-${index}`}
                                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleFileUpload(index, file);
                                    }
                                  }}
                                  className="hidden"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => document.getElementById(`edit-file-${index}`)?.click()}
                                >
                                  <Upload size={16} className="mr-1" />
                                  Upload File
                                </Button>
                                {segment.fileName && (
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <File size={14} className="mr-1" />
                                    {segment.fileName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowEditForm(false);
                        setEditingSop(null);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpdateSop}
                      disabled={updateSopMutation.isPending}
                    >
                      <Save size={16} className="mr-1" />
                      {updateSopMutation.isPending ? "Updating..." : "Update SOP"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
