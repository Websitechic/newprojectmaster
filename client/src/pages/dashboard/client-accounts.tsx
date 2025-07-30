
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

      {/* Client Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {clients.map((client) => (
          <Card key={client.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 truncate">
                    <User className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{client.name}</span>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1 text-xs">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </CardDescription>
                </div>
                <Badge 
                  variant={getStatusBadgeVariant(client.onboardingStatus)}
                  className="text-xs px-2 py-1 ml-2 flex-shrink-0"
                >
                  {client.onboardingStatus.replace(/_/g, " ")}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-2 pt-0">
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <Building2 className="w-3 h-3 text-gray-500 flex-shrink-0" />
                  <span className="font-medium">Service:</span>
                  <span className="truncate text-gray-600">{getProductServiceLabel(client.productService)}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3 text-gray-500 flex-shrink-0" />
                  <span className="font-medium">Type:</span>
                  <span className="truncate text-gray-600">{getClientTypeLabel(client.clientType)}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-gray-500 flex-shrink-0" />
                  <span className="font-medium">Created:</span>
                  <span className="text-gray-600">{format(new Date(client.createdAt), "MMM dd, yy")}</span>
                </div>
                
                {client.lastActive && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="font-medium">Active:</span>
                    <span className="text-gray-600">{format(new Date(client.lastActive), "MMM dd, yy")}</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 pt-2 border-t">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${client.emailVerified ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-xs text-gray-600">
                  {client.emailVerified ? 'Email Verified' : 'Email Pending'}
                </span>
                {client.emailVerified && <CheckCircle className="w-3 h-3 text-green-500 ml-auto" />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
