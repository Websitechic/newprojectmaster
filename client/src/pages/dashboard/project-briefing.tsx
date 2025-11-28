
import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Save, 
  FileText, 
  Trash2,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlertCircle,
  Plus,
  Eye,
  Search
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface ProjectBriefing {
  id: number;
  projectName: string;
  clientName: string;
  category: string;
  projectDetails: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const applyFormatting = useCallback((format: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let beforeText = value.substring(0, start);
    let afterText = value.substring(end);
    let newText = "";
    let newCursorPos = end;

    switch (format) {
      case "bold":
        if (selectedText) {
          newText = `**${selectedText}**`;
          newCursorPos = end + 4;
        } else {
          newText = "****";
          newCursorPos = start + 2;
        }
        break;
      case "italic":
        if (selectedText) {
          newText = `*${selectedText}*`;
          newCursorPos = end + 2;
        } else {
          newText = "**";
          newCursorPos = start + 1;
        }
        break;
      case "underline":
        if (selectedText) {
          newText = `<u>${selectedText}</u>`;
          newCursorPos = end + 7;
        } else {
          newText = "<u></u>";
          newCursorPos = start + 3;
        }
        break;
      case "bullet":
        const bulletText = selectedText || "List item";
        newText = `• ${bulletText}`;
        newCursorPos = start + newText.length;
        break;
      case "numbered":
        const numberedText = selectedText || "List item";
        newText = `1. ${numberedText}`;
        newCursorPos = start + newText.length;
        break;
      default:
        return;
    }

    const newValue = beforeText + newText + afterText;
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [value, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex gap-1 p-2 border rounded-t-md bg-gray-50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("bold")}
          className="h-8 w-8 p-0"
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("italic")}
          className="h-8 w-8 p-0"
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("underline")}
          className="h-8 w-8 p-0"
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 my-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("bullet")}
          className="h-8 w-8 p-0"
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("numbered")}
          className="h-8 w-8 p-0"
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[400px] rounded-t-none border-t-0 font-mono text-sm"
      />
    </div>
  );
}

export default function ProjectBriefing() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    projectName: "",
    clientName: "",
    category: "",
    projectDetails: "",
  });

  // Check if user has access
  const hasAccess = user?.role === "project_manager" || 
                   user?.role === "operations_manager" || 
                   user?.role === "team_lead" ||
                   user?.role === "customer_support_officer" ||
                   user?.specialization === "operations_manager";

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
              <p className="text-gray-600">Only project managers, operations managers, customer support officers, and team leads can access this page.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fetch briefings
  const { data: briefings = [] } = useQuery<ProjectBriefing[]>({
    queryKey: ["/api/project-briefings"],
    queryFn: async () => {
      const response = await fetch("/api/project-briefings");
      if (!response.ok) {
        throw new Error("Failed to fetch project briefings");
      }
      return response.json();
    },
  });

  // Filter briefings based on search query
  const filteredBriefings = briefings.filter((briefing) => {
    const query = searchQuery.toLowerCase();
    return (
      briefing.projectName.toLowerCase().includes(query) ||
      briefing.clientName.toLowerCase().includes(query) ||
      briefing.category.toLowerCase().includes(query)
    );
  });

  // Create briefing mutation
  const createBriefingMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
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
      setIsCreating(false);
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

  // Delete briefing mutation
  const deleteBriefingMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/project-briefings/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete project briefing");
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

  const resetForm = () => {
    setFormData({
      projectName: "",
      clientName: "",
      category: "",
      projectDetails: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectName || !formData.clientName || !formData.category || !formData.projectDetails) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createBriefingMutation.mutate(formData);
  };

  const categories = [
    "Website Development",
    "DPL Outright",
    "DPL Partnership",
    "Direct Marketing",
    "Support & Maintenance"
  ];

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath="/dashboard/project-briefing" />
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <Header />
        <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 w-full">
          <div className="w-full space-y-4 lg:space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="h-6 w-6 md:h-8 md:w-8 text-purple-600" />
                  New Project Briefing
                </h1>
                <p className="text-gray-600 mt-1 text-sm md:text-base">
                  Create and manage project briefings with detailed information and links
                </p>
              </div>
              <Button onClick={() => setIsCreating(!isCreating)} className="flex items-center gap-2">
                <Plus size={16} />
                {isCreating ? "Cancel" : "New Briefing"}
              </Button>
            </div>

            {/* Search Bar */}
            {!isCreating && briefings.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by project name, client, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}

            {/* Create Form */}
            {isCreating && (
              <Card>
                <CardHeader>
                  <CardTitle>Create Project Briefing</CardTitle>
                  <CardDescription>Fill in the project details below</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="projectName">Project Name *</Label>
                      <Input
                        id="projectName"
                        value={formData.projectName}
                        onChange={(e) => setFormData(prev => ({ ...prev, projectName: e.target.value }))}
                        placeholder="Enter project name"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="clientName">Client Name *</Label>
                      <Input
                        id="clientName"
                        value={formData.clientName}
                        onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                        placeholder="Enter client name"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="category">Project Category *</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select project category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="projectDetails">Project Details *</Label>
                      <RichTextEditor
                        value={formData.projectDetails}
                        onChange={(value) => setFormData(prev => ({ ...prev, projectDetails: value }))}
                        placeholder="Enter project details, paste links, and use formatting tools above..."
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsCreating(false);
                          resetForm();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createBriefingMutation.isPending}>
                        <Save size={16} className="mr-1" />
                        {createBriefingMutation.isPending ? "Saving..." : "Save Briefing"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Briefings List */}
            <div className="space-y-4">
              {filteredBriefings.length === 0 ? (
                <Card className="p-12 text-center">
                  <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchQuery ? "No matching briefings found" : "No Project Briefings"}
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {searchQuery 
                      ? "Try adjusting your search terms" 
                      : "Get started by creating your first project briefing."}
                  </p>
                  {!searchQuery && (
                    <Button onClick={() => setIsCreating(true)}>
                      <Plus size={16} className="mr-1" />
                      Create First Briefing
                    </Button>
                  )}
                </Card>
              ) : (
                filteredBriefings.map((briefing) => (
                  <Card key={briefing.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl mb-2">{briefing.projectName}</CardTitle>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>Client: {briefing.clientName}</span>
                            <span>•</span>
                            <span>{briefing.category}</span>
                            <span>•</span>
                            <span>{new Date(briefing.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" title="View Details">
                                <Eye className="h-4 w-4 text-blue-600" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>{briefing.projectName}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <h3 className="font-medium text-sm text-gray-700 mb-1">Client</h3>
                                  <p className="text-gray-900">{briefing.clientName}</p>
                                </div>
                                <div>
                                  <h3 className="font-medium text-sm text-gray-700 mb-1">Category</h3>
                                  <p className="text-gray-900">{briefing.category}</p>
                                </div>
                                <div>
                                  <h3 className="font-medium text-sm text-gray-700 mb-1">Project Details</h3>
                                  <div className="prose prose-sm max-w-none">
                                    <p className="text-gray-700 whitespace-pre-wrap">{briefing.projectDetails}</p>
                                  </div>
                                </div>
                                <div>
                                  <h3 className="font-medium text-sm text-gray-700 mb-1">Created On</h3>
                                  <p className="text-gray-900">{new Date(briefing.createdAt).toLocaleString()}</p>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Project Briefing?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this project briefing? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteBriefingMutation.mutate(briefing.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
