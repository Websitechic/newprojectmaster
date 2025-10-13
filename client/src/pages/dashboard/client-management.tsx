
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Building2, CheckCircle, Clock, AlertCircle, XCircle } from "lucide-react";
import { useLocation } from "wouter";

interface Client {
  id: number;
  name: string;
  email: string;
  status: string;
  lastActive?: string;
  createdAt: string;
  onboardingStatus: "onboarded" | "not_onboarded" | "onboarding_in_progress" | "onboarding_pending";
  projectCount: number;
}

const statusConfig = {
  onboarded: {
    label: "Onboarded",
    icon: CheckCircle,
    variant: "default" as const,
    color: "text-green-600",
  },
  not_onboarded: {
    label: "Not Onboarded",
    icon: XCircle,
    variant: "destructive" as const,
    color: "text-red-600",
  },
  onboarding_in_progress: {
    label: "Onboarding in Progress",
    icon: Clock,
    variant: "secondary" as const,
    color: "text-blue-600",
  },
  onboarding_pending: {
    label: "Onboarding Pending",
    icon: AlertCircle,
    variant: "outline" as const,
    color: "text-orange-600",
  },
};

export default function ClientManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();

  // Check if user is product owner or customer support officer
  if (!user || (user.role !== "product_owner" && user.role !== "customer_support_officer")) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard/client-management" />
        <div className="flex-1 flex flex-col">
          <Header />
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-destructive">Only product owners and customer support officers can access client management</p>
          </div>
        </div>
      </div>
    );
  }

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients/management"],
    queryFn: async () => {
      const response = await fetch("/api/clients/management");
      if (!response.ok) {
        throw new Error("Failed to fetch clients");
      }
      return response.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ clientId, status }: { clientId: number; status: string }) => {
      const response = await fetch(`/api/clients/${clientId}/onboarding-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingStatus: status }),
      });
      if (!response.ok) {
        throw new Error("Failed to update client status");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients/management"] });
      toast({
        title: "Success",
        description: "Client onboarding status updated successfully",
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

  const handleStatusChange = (clientId: number, newStatus: string) => {
    updateStatusMutation.mutate({ clientId, status: newStatus });
  };

  const getStatusSummary = () => {
    if (!clients) return { total: 0, onboarded: 0, pending: 0, inProgress: 0, notOnboarded: 0 };
    
    return {
      total: clients.length,
      onboarded: clients.filter(c => c.onboardingStatus === "onboarded").length,
      pending: clients.filter(c => c.onboardingStatus === "onboarding_pending").length,
      inProgress: clients.filter(c => c.onboardingStatus === "onboarding_in_progress").length,
      notOnboarded: clients.filter(c => c.onboardingStatus === "not_onboarded").length,
    };
  };

  const summary = getStatusSummary();

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-2 sm:p-4 lg:p-6 w-full">
          <div className="space-y-6 w-full max-w-none min-w-0">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Users className="h-6 w-6" />
                  Client Management
                </h1>
                <p className="text-muted-foreground">
                  Manage client onboarding status and track progress
                </p>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 w-full">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.total}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Onboarded
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{summary.onboarded}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    In Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{summary.inProgress}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    Pending
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{summary.pending}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    Not Onboarded
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{summary.notOnboarded}</div>
                </CardContent>
              </Card>
            </div>

            {/* Clients Table */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Client Accounts</CardTitle>
                <CardDescription>
                  Manage onboarding status for all client accounts
                </CardDescription>
              </CardHeader>
              <CardContent className="w-full p-0">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : clients && clients.length > 0 ? (
                  <div className="w-full">
                    <div className="overflow-x-auto">
                      <Table className="w-full min-w-[1000px]">
                        <TableHeader>
                      <TableRow>
                        <TableHead>Client Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Projects</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Onboarding Status</TableHead>
                        <TableHead>Joined Date</TableHead>
                        <TableHead>Last Active</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.map((client) => {
                        const statusInfo = statusConfig[client.onboardingStatus];
                        const StatusIcon = statusInfo.icon;
                        
                        return (
                          <TableRow key={client.id}>
                            <TableCell className="font-medium">{client.name}</TableCell>
                            <TableCell>{client.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{client.projectCount} projects</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={client.status === "online" ? "default" : "secondary"}>
                                {client.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <StatusIcon className={`h-4 w-4 ${statusInfo.color}`} />
                                <Badge variant={statusInfo.variant}>
                                  {statusInfo.label}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(client.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {client.lastActive 
                                ? new Date(client.lastActive).toLocaleDateString()
                                : "Never"
                              }
                            </TableCell>
                            <TableCell>
                              <Select
                                value={client.onboardingStatus}
                                onValueChange={(value) => handleStatusChange(client.id, value)}
                                disabled={updateStatusMutation.isPending}
                              >
                                <SelectTrigger className="w-full min-w-[180px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not_onboarded">Not Onboarded</SelectItem>
                                  <SelectItem value="onboarding_pending">Onboarding Pending</SelectItem>
                                  <SelectItem value="onboarding_in_progress">Onboarding in Progress</SelectItem>
                                  <SelectItem value="onboarded">Onboarded</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Clients Found</h3>
                    <p className="text-muted-foreground">
                      No client accounts have been created yet.
                    </p>
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
