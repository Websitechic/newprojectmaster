
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Upload, FileText, Download, Search } from "lucide-react";

interface Resource {
  id: number;
  name: string;
  type: string;
  size: number;
  path: string;
  uploadedBy: number;
  createdAt: string;
  uploaderName?: string;
}

export default function ProjectResources() {
  const { id } = useParams();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const projectId = parseInt(id!);

  const { data: resources, isLoading } = useQuery<Resource[]>({
    queryKey: [`/api/projects/${projectId}/resources`],
    queryFn: () => fetch(`/api/projects/${projectId}/resources`).then(res => res.json()),
    enabled: !!id,
  });

  const isProjectManager = user?.role === "project_manager";

  const filteredResources = resources?.filter(resource =>
    resource.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
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
              {isProjectManager ? "Manage" : "Access"} project documents and files
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
            
            {isProjectManager && (
              <Button className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload File
              </Button>
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
                            {formatFileSize(resource.size)}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
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
                  : isProjectManager 
                    ? "Start by uploading some project documents and files."
                    : "No resources have been uploaded to this project yet."
                }
              </p>
              {isProjectManager && !searchTerm && (
                <Button className="mt-4 flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload First File
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
