
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { Upload, FileText, Download, Search, Link, ExternalLink, Edit2, Trash2, MoreVertical, ChevronDown, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Resource {
  id: number;
  name: string;
  type: string;
  size?: number;
  path?: string;
  link?: string;
  uploadedBy: number;
  createdAt: string;
  uploaderName?: string;
}

export default function ProjectResources() {
  const { id } = useParams();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["onboarding", "login_details", "creatives", "written_copies", "other_deliverables"]));
  const projectId = parseInt(id!);

  const { data: resources, isLoading, refetch } = useQuery<Resource[]>({
    queryKey: [`/api/projects/${projectId}/resources`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/resources`, {
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error('Failed to fetch resources');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!id,
  });

  const isProjectManager = user?.role === "project_manager";
  const isProductOwner = user?.role === "product_owner";
  const isCustomerSupportOfficer = user?.role === "customer_support_officer";
  const isTeamLead = user?.role === "team_lead";
  const isOperationsManager = user?.role === "operations_manager" || user?.specialization === "operations_manager";
  const canManageResources = isProjectManager || isProductOwner || isCustomerSupportOfficer || isTeamLead || isOperationsManager;

  const categoryOptions = [
    { value: "onboarding", label: "Onboarding" },
    { value: "login_details", label: "Login Details" },
    { value: "creatives", label: "Creatives" },
    { value: "written_copies", label: "Written Copies" },
    { value: "other_deliverables", label: "Other Deliverables" }
  ];

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // State for link upload dialog
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkCategory, setLinkCategory] = useState("");
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);

  // State for edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // State for delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAddLink = async () => {
    if (!linkName.trim() || !linkUrl.trim() || !linkCategory.trim()) {
      console.log("Missing name, URL, or category");
      alert("Please enter a name, URL, and select a category for the link");
      return;
    }

    console.log("Starting link upload...", { 
      projectId, 
      name: linkName.trim(), 
      link: linkUrl.trim() 
    });

    setIsSubmittingLink(true);
    try {
      const url = `/api/projects/${projectId}/resources/link`;
      const payload = {
        name: linkName.trim(),
        link: linkUrl.trim(),
        category: linkCategory.trim(),
      };

      console.log("Making request to:", url);
      console.log("Payload:", payload);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Important for session-based authentication
        body: JSON.stringify(payload),
      });

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("Error response text:", errorText);
        
        let errorMessage = "Failed to add link";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch (e) {
          console.log("Could not parse error as JSON");
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log("Success response:", result);

      // Reset form and close dialog
      setLinkName("");
      setLinkUrl("");
      setLinkCategory("");
      setShowLinkDialog(false);
      
      // Refresh resources list
      await refetch();
      alert("Link added successfully!");
    } catch (error) {
      console.error("Error adding link:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add link";
      console.error("Error message:", errorMessage);
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const handleEditResource = (resource: Resource) => {
    setEditingResource(resource);
    setEditName(resource.name);
    setEditUrl(resource.link || "");
    setEditCategory(resource.type || "");
    setShowEditDialog(true);
  };

  const handleUpdateResource = async () => {
    if (!editingResource || !editName.trim() || !editUrl.trim() || !editCategory.trim()) {
      alert("Please enter a name, URL, and select a category for the link");
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/resources/${editingResource.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: editName.trim(),
          link: editUrl.trim(),
          category: editCategory.trim(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to update resource";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch (e) {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Reset form and close dialog
      setEditName("");
      setEditUrl("");
      setEditCategory("");
      setEditingResource(null);
      setShowEditDialog(false);
      
      // Refresh resources list
      await refetch();
      alert("Resource updated successfully!");
    } catch (error) {
      console.error("Error updating resource:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update resource";
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteResource = async (resource: Resource) => {
    setDeletingResource(resource);
    setShowDeleteDialog(true);
  };

  const confirmDeleteResource = async () => {
    if (!deletingResource) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/resources/${deletingResource.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to delete resource";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch (e) {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Close dialog and reset state
      setDeletingResource(null);
      setShowDeleteDialog(false);
      
      // Refresh resources list
      await refetch();
      alert("Resource deleted successfully!");
    } catch (error) {
      console.error("Error deleting resource:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete resource";
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredResources = Array.isArray(resources) ? resources.filter(resource =>
    resource.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  // Group resources by category
  const resourcesByCategory = filteredResources.reduce((acc, resource) => {
    const category = resource.type || 'other_deliverables';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(resource);
    return acc;
  }, {} as Record<string, typeof filteredResources>);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type === 'link') return '🔗';
    if (type.includes('image')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('video')) return '🎥';
    if (type.includes('audio')) return '🎵';
    return '📁';
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Project Resources</h1>
            <p className="text-muted-foreground">
              {canManageResources ? "Manage" : "Access"} project documents, files, and links
            </p>
          </div>

          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search resources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {canManageResources && (
              <div className="flex gap-2">
                <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      Add Link
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Resource Link</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="linkName">Link Name</Label>
                        <Input
                          id="linkName"
                          value={linkName}
                          onChange={(e) => setLinkName(e.target.value)}
                          placeholder="Enter a name for this link"
                        />
                      </div>
                      <div>
                        <Label htmlFor="linkUrl">URL</Label>
                        <Input
                          id="linkUrl"
                          type="url"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          placeholder="https://example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="linkCategory">Category</Label>
                        <Select value={linkCategory} onValueChange={setLinkCategory}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categoryOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button 
                          variant="outline" 
                          onClick={() => setShowLinkDialog(false)}
                          disabled={isSubmittingLink}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAddLink}
                          disabled={!linkName.trim() || !linkUrl.trim() || !linkCategory.trim() || isSubmittingLink}
                        >
                          {isSubmittingLink ? "Adding..." : "Add Link"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          {/* Edit Resource Dialog */}
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Resource Link</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="editName">Link Name</Label>
                  <Input
                    id="editName"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter a name for this link"
                  />
                </div>
                <div>
                  <Label htmlFor="editUrl">URL</Label>
                  <Input
                    id="editUrl"
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="editCategory">Category</Label>
                  <Select value={editCategory} onValueChange={setEditCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowEditDialog(false)}
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleUpdateResource}
                    disabled={!editName.trim() || !editUrl.trim() || !editCategory.trim() || isUpdating}
                  >
                    {isUpdating ? "Updating..." : "Update"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete Resource Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the resource "{deletingResource?.name}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDeleteResource}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {filteredResources.length > 0 ? (
            <div className="space-y-6">
              {categoryOptions.map(({ value: categoryKey, label: categoryLabel }) => {
                const categoryResources = resourcesByCategory[categoryKey] || [];
                if (categoryResources.length === 0) return null;

                return (
                  <div key={categoryKey} className="border rounded-lg shadow-sm">
                    <Collapsible 
                      open={expandedCategories.has(categoryKey)} 
                      onOpenChange={() => toggleCategory(categoryKey)}
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/30 hover:bg-muted rounded-t-lg text-left border-b border-border/50">
                        <h2 className="text-lg font-semibold flex items-center">
                          {expandedCategories.has(categoryKey) ? 
                            <ChevronDown className="mr-2 h-4 w-4 text-primary" /> : 
                            <ChevronRight className="mr-2 h-4 w-4 text-primary" />
                          }
                          {categoryLabel}
                        </h2>
                        <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium">
                          {categoryResources.length} {categoryResources.length === 1 ? 'resource' : 'resources'}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {categoryResources.map((resource) => (
                            <Card key={resource.id} className="hover:shadow-md transition-shadow">
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-3">
                                    <span className="text-2xl">{getFileIcon(resource.type)}</span>
                                    <div className="min-w-0 flex-1">
                                      <CardTitle className="text-sm font-medium truncate" title={resource.name}>
                                        {resource.name}
                                      </CardTitle>
                                      <p className="text-xs text-muted-foreground">
                                        {resource.type === 'link' || resource.link ? 'External Link' : formatFileSize(resource.size || 0)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {resource.type === 'link' || resource.link ? (
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => window.open(resource.link, '_blank')}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    ) : (
                                      <Button variant="ghost" size="sm">
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    )}
                                    
                                    {canManageResources && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="sm">
                                            <MoreVertical className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                          {(resource.type === 'link' || resource.link) && (
                                            <DropdownMenuItem onClick={() => handleEditResource(resource)}>
                                              <Edit2 className="h-4 w-4 mr-2" />
                                              Edit
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuItem 
                                            onClick={() => handleDeleteResource(resource)}
                                            className="text-red-600"
                                          >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="text-xs text-muted-foreground">
                                  <p>Uploaded {new Date(resource.createdAt).toLocaleDateString()}</p>
                                  {resource.uploaderName && (
                                    <p>by {resource.uploaderName}</p>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-blue-50 p-4 rounded-full mb-4">
                <FileText className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-medium mb-2">No Resources Found</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {searchTerm 
                  ? `No resources match "${searchTerm}"`
                  : canManageResources 
                    ? "Start by uploading files or adding resource links."
                    : "No resources have been added to this project yet."
                }
              </p>
              {canManageResources && !searchTerm && (
                <div className="mt-4 flex gap-2">
                  <Button 
                    className="flex items-center gap-2"
                    onClick={() => setShowLinkDialog(true)}
                  >
                    <Link className="h-4 w-4" />
                    Add Link
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
