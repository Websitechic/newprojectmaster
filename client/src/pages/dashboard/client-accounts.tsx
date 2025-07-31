
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Mail, User, Calendar, Building2, Phone, MapPin, CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface ClientAccount {
  id: number;
  name: string;
  email: string;
  username: string;
  role: string;
  productService: string | null;
  clientType: string | null;
  onboardingStatus: string;
  emailVerified: boolean;
  createdAt: string;
  lastActive: string | null;
}

interface CreateClientData {
  name: string;
  email: string;
  username: string;
  password: string;
  productService: string;
  clientType: string;
}

export default function ClientAccounts() {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CreateClientData>({
    name: "",
    email: "",
    username: "",
    password: "",
    productService: "",
    clientType: "",
  });

  // Check if user has permission to access this page
  if (user?.role !== "project_manager" && user?.role !== "product_owner") {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center space-y-4 p-6">
            <Building2 className="h-12 w-12 text-gray-400" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Access Restricted</h3>
              <p className="text-sm text-gray-600">
                Only Project Managers and Product Owners can access client account management.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch client accounts
  const { data: clients = [], isLoading, error } = useQuery<ClientAccount[]>({
    queryKey: ["/api/client-accounts"],
    queryFn: async () => {
      const response = await fetch("/api/client-accounts");
      if (!response.ok) {
        throw new Error("Failed to fetch client accounts");
      }
      return response.json();
    },
  });

  // Create client mutation
  const createClientMutation = useMutation({
    mutationFn: async (data: CreateClientData) => {
      const response = await fetch("/api/client-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create client account");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-accounts"] });
      setIsCreateDialogOpen(false);
      setFormData({
        name: "",
        email: "",
        username: "",
        password: "",
        productService: "",
        clientType: "",
      });
      toast({
        title: "Success",
        description: "Client account created successfully",
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

  const handleInputChange = (field: keyof CreateClientData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateClient = () => {
    // Basic validation
    if (!formData.name || !formData.email || !formData.username || !formData.password || !formData.productService || !formData.clientType) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createClientMutation.mutate(formData);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "onboarded":
        return "default";
      case "onboarding_in_progress":
        return "secondary";
      case "onboarding_pending":
        return "outline";
      default:
        return "outline";
    }
  };

  const getProductServiceLabel = (service: string | null) => {
    if (!service) return "Not specified";
    
    const labels: Record<string, string> = {
      website_development: "Website Dev",
      dpl_outright: "DPL Outright",
      dpl_partnership: "DPL Partnership",
      direct_marketing: "Direct Marketing",
      support_maintenance: "Support & Maintenance",
    };
    
    return labels[service] || service;
  };

  const getClientTypeLabel = (type: string | null) => {
    if (!type) return "Not specified";
    
    const labels: Record<string, string> = {
      project_client: "Project Client",
      support_maintenance_client: "Support Client",
    };
    
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center space-y-4 p-6">
            <Building2 className="h-12 w-12 text-red-400" />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-red-600">Error Loading Clients</h3>
              <p className="text-sm text-gray-600">
                Failed to load client accounts. Please try again later.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Client Accounts</h1>
          <p className="text-sm md:text-base text-gray-600">
            Manage and create client accounts for your projects
          </p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Create Client Account</span>
              <span className="sm:hidden">Create Client</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md mx-4">
            <DialogHeader>
              <DialogTitle>Create New Client Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter client's full name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="Enter client's email"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => handleInputChange("username", e.target.value)}
                  placeholder="Enter username for login"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange("password", e.target.value)}
                  placeholder="Enter initial password"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="productService">Product/Service</Label>
                <Select value={formData.productService} onValueChange={(value) => handleInputChange("productService", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product/service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="website_development">Website Development</SelectItem>
                    <SelectItem value="dpl_outright">DPL Outright</SelectItem>
                    <SelectItem value="dpl_partnership">DPL Partnership</SelectItem>
                    <SelectItem value="direct_marketing">Direct Marketing</SelectItem>
                    <SelectItem value="support_maintenance">Support & Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="clientType">Client Type</Label>
                <Select value={formData.clientType} onValueChange={(value) => handleInputChange("clientType", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project_client">Project Client</SelectItem>
                    <SelectItem value="support_maintenance_client">Support & Maintenance Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={handleCreateClient} 
                className="w-full"
                disabled={createClientMutation.isPending}
              >
                {createClientMutation.isPending ? "Creating..." : "Create Client Account"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Client List */}
      <Card>
        <CardHeader>
          <CardTitle>Client Directory ({clients.length} clients)</CardTitle>
          <CardDescription>
            Comprehensive list of all client accounts and their current status
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {clients.map((client) => (
              <div key={client.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* Left side - Client Info */}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <h3 className="font-semibold text-lg">{client.name}</h3>
                      <Badge 
                        variant={getStatusBadgeVariant(client.onboardingStatus)}
                        className="text-xs"
                      >
                        {client.onboardingStatus.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span>{client.email}</span>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        <span>{getProductServiceLabel(client.productService)}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>{getClientTypeLabel(client.clientType)}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>Created {format(new Date(client.createdAt), "MMM dd, yyyy")}</span>
                      </div>
                      
                      {client.lastActive && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Last active {format(new Date(client.lastActive), "MMM dd, yyyy")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Right side - Status */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${client.emailVerified ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      <span className="text-xs text-gray-600">
                        {client.emailVerified ? 'Email Verified' : 'Email Pending'}
                      </span>
                      {client.emailVerified && <CheckCircle className="w-4 h-4 text-green-500" />}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {clients.length === 0 && (
        <Card className="text-center py-8 md:py-12">
          <CardContent>
            <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Client Accounts</h3>
            <p className="text-gray-600 mb-4 text-sm md:text-base px-4">
              You haven't created any client accounts yet. Create your first client account to get started.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Create First Client Account
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
