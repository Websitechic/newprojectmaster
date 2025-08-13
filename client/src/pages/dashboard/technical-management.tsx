
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { useState, useEffect } from "react";
import { Settings, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface TechnicalSupportRequest {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  requester: {
    id: number;
    name: string;
    email: string;
  };
  assignedTo?: {
    id: number;
    name: string;
    email: string;
  };
  task?: {
    id: number;
    title: string;
  };
  project?: {
    id: number;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function TechnicalManagement() {
  const [location] = useLocation();
  const { user } = useUser();
  const [requests, setRequests] = useState<TechnicalSupportRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch("/api/technical-support/requests");
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      }
    } catch (error) {
      console.error("Error fetching technical support requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'in_progress': return 'bg-blue-500';
      case 'resolved': return 'bg-green-500';
      case 'closed': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Settings className="h-6 w-6 text-blue-600" />
                  Technical Management
                </h1>
                <p className="text-muted-foreground">
                  Manage technical support requests and oversee technical operations
                </p>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    {requests.filter(r => r.status === 'pending').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {requests.filter(r => r.status === 'in_progress').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Resolved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {requests.filter(r => r.status === 'resolved').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {requests.length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Requests List */}
            <Card>
              <CardHeader>
                <CardTitle>Technical Support Requests</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : requests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No technical support requests found.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {requests.map((request) => (
                      <div key={request.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium">{request.title}</h3>
                              <Badge className={`${getStatusColor(request.status)} text-white text-xs`}>
                                {request.status.replace('_', ' ')}
                              </Badge>
                              <Badge className={`${getPriorityColor(request.priority)} text-white text-xs`}>
                                {request.priority}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {request.description}
                            </p>
                            <div className="text-xs text-muted-foreground">
                              <div>Requested by: {request.requester.name}</div>
                              {request.assignedTo && (
                                <div>Assigned to: {request.assignedTo.name}</div>
                              )}
                              {request.task && (
                                <div>Related task: {request.task.title}</div>
                              )}
                              {request.project && (
                                <div>Project: {request.project.name}</div>
                              )}
                              <div>Created: {new Date(request.createdAt).toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
