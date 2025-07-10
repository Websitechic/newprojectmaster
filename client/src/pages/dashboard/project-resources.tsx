
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
import { useAuth } from "@/hooks/use-auth";
import { Upload, FileText, Download, Search, Link, ExternalLink } from "lucide-react";

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
  const projectId = parseInt(id!);

  const { data: resources, isLoading, refetch } = useQuery<Resource[]>({
    queryKey: [`/api/projects/${projectId}/resources`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/resources`);
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
  const canManageResources = isProjectManager || isProductOwner;

  // State for link upload dialog
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);

  const handleAddLink = async () => {
    if (!linkName.trim() || !linkUrl.trim()) {
      console.log("Missing name or URL");
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
      };

      console.log("Making request to:", url);
      console.log("Payload:", payload);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      setShowLinkDialog(false);
      
      // Refresh resources list
      refetch();
      alert("Link added successfully!");
    } catch (error) {
      console.error("Error adding link:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add link";
      console.error("Error message:", errorMessage);
      alert(errorMessage);
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const filteredResources = Array.isArray(resources) ? resources.filter(resource =>
    resource.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

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
                <Button className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload File
                </Button>
                
                <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2">
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
                          disabled={!linkName.trim() || !linkUrl.trim() || isSubmittingLink}
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

          {filteredResources.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredResources.map((resource) => (
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
                            {resource.type === 'link' ? 'External Link' : formatFileSize(resource.size || 0)}
                          </p>
                        </div>
                      </div>
                      {resource.type === 'link' ? (
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
                  <Button className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload File
                  </Button>
                  <Button 
                    variant="outline" 
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
