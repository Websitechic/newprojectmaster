import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Mail, User, Calendar, Building2, Phone, MapPin, CheckCircle, Search, Filter, Download } from "lucide-react";
import { format, differenceInDays, differenceInMonths } from "date-fns";

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
  gender?: string | null;
}

interface CreateClientData {
  name: string;
  email: string;
  username: string;
  password: string;
  productService: string;
  clientType: string;
  gender: string;
}

export default function ClientAccounts() {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [productServiceFilter, setProductServiceFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [durationFilter, setDurationFilter] = useState<string>("all");
  const [formData, setFormData] = useState<CreateClientData>({
    name: "",
    email: "",
    username: "",
    password: "",
    productService: "",
    clientType: "",
    gender: "",
  });

  // Check if user has permission to access this page
  if (user?.role !== "project_manager" && user?.role !== "product_owner" && user?.role !== "operations_manager" && user?.role !== "team_lead" && user?.specialization !== "operations_manager") {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center space-y-4 p-6">
            <Building2 className="h-12 w-12 text-gray-400" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Access Restricted</h3>
              <p className="text-sm text-gray-600">
                Only Project Managers, Product Owners, Operations Managers, and Team Leads can access client account management.
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
        gender: "",
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
    if (!formData.name || !formData.email || !formData.username || !formData.password || !formData.productService || !formData.clientType || !formData.gender) {
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

  // Filter and search clients
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      // Search filter
      const matchesSearch = searchTerm === "" || 
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.username.toLowerCase().includes(searchTerm.toLowerCase());

      // Product service filter
      const matchesProductService = productServiceFilter === "all" || 
        client.productService === productServiceFilter;

      // Gender filter
      const matchesGender = genderFilter === "all" || 
        client.gender === genderFilter;

      // Duration filter (based on registration date)
      let matchesDuration = true;
      if (durationFilter !== "all") {
        const registrationDate = new Date(client.createdAt);
        const daysSinceRegistration = differenceInDays(new Date(), registrationDate);

        switch (durationFilter) {
          case "week":
            matchesDuration = daysSinceRegistration <= 7;
            break;
          case "month":
            matchesDuration = daysSinceRegistration <= 30;
            break;
          case "3months":
            matchesDuration = daysSinceRegistration <= 90;
            break;
          case "6months":
            matchesDuration = daysSinceRegistration <= 180;
            break;
          case "year":
            matchesDuration = daysSinceRegistration <= 365;
            break;
        }
      }

      return matchesSearch && matchesProductService && matchesGender && matchesDuration;
    });
  }, [clients, searchTerm, productServiceFilter, genderFilter, durationFilter]);

  // Export to Excel functionality
  const exportToExcel = () => {
    const dataToExport = filteredClients.map(client => ({
      'Name': client.name,
      'Email': client.email,
      'Username': client.username,
      'Product/Service': getProductServiceLabel(client.productService),
      'Client Type': getClientTypeLabel(client.clientType),
      'Status': client.onboardingStatus.replace(/_/g, " "),
      'Email Verified': client.emailVerified ? 'Yes' : 'No',
      'Gender': client.gender || 'Not specified',
      'Registration Date': format(new Date(client.createdAt), "MMM dd, yyyy"),
      'Last Active': client.lastActive ? format(new Date(client.lastActive), "MMM dd, yyyy") : "Never",
      'Days Since Registration': differenceInDays(new Date(), new Date(client.createdAt))
    }));

    // Convert to CSV format
    const headers = Object.keys(dataToExport[0] || {});
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(row => 
        headers.map(header => `"${String(row[header as keyof typeof row] || '')}"`).join(',')
      )
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `client_accounts_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: `Exported ${filteredClients.length} client records to Excel format`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const [location] = useLocation();

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
    <div className="flex min-h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
        <div className="flex-1 overflow-auto space-y-6 p-4 md:p-6">
          {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Client Accounts</h1>
          <p className="text-sm md:text-base text-gray-600">
            Manage and create client accounts for your projects
          </p>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={exportToExcel}
            disabled={filteredClients.length === 0}
            className="w-full sm:w-auto"
          >
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Export to Excel</span>
            <span className="sm:hidden">Export</span>
          </Button>

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

              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={formData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
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
      </div>

      {/* Search and Filter Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Search & Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search Input */}
            <div className="space-y-2">
              <Label htmlFor="search">Search Clients</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search by name, email, or username"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Product Service Filter */}
            <div className="space-y-2">
              <Label>Product/Service</Label>
              <Select value={productServiceFilter} onValueChange={setProductServiceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Services" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  <SelectItem value="website_development">Website Development</SelectItem>
                  <SelectItem value="dpl_outright">DPL Outright</SelectItem>
                  <SelectItem value="dpl_partnership">DPL Partnership</SelectItem>
                  <SelectItem value="direct_marketing">Direct Marketing</SelectItem>
                  <SelectItem value="support_maintenance">Support & Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Gender Filter */}
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Genders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration Filter */}
            <div className="space-y-2">
              <Label>Registration Duration</Label>
              <Select value={durationFilter} onValueChange={setDurationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="week">Last Week</SelectItem>
                  <SelectItem value="month">Last Month</SelectItem>
                  <SelectItem value="3months">Last 3 Months</SelectItem>
                  <SelectItem value="6months">Last 6 Months</SelectItem>
                  <SelectItem value="year">Last Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm("");
                  setProductServiceFilter("all");
                  setGenderFilter("all");
                  setDurationFilter("all");
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client List - Table Format */}
      <Card>
        <CardHeader>
          <CardTitle>Client Directory ({filteredClients.length} of {clients.length} clients)</CardTitle>
          <CardDescription>
            Comprehensive list of all client accounts and their current status
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-4 font-medium">Name</th>
                  <th className="text-left p-4 font-medium">Email</th>
                  <th className="text-left p-4 font-medium">Username</th>
                  <th className="text-left p-4 font-medium">Product/Service</th>
                  <th className="text-left p-4 font-medium">Client Type</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Email Verified</th>
                  <th className="text-left p-4 font-medium">Gender</th>
                  <th className="text-left p-4 font-medium">Created</th>
                  <th className="text-left p-4 font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client, index) => (
                  <tr key={client.id} className={`border-b hover:bg-gray-50 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-muted/20"}`}>
                    <td className="p-4 font-medium">{client.name}</td>
                    <td className="p-4 text-gray-600">{client.email}</td>
                    <td className="p-4 text-gray-600">{client.username}</td>
                    <td className="p-4 text-gray-600">{getProductServiceLabel(client.productService)}</td>
                    <td className="p-4 text-gray-600">{getClientTypeLabel(client.clientType)}</td>
                    <td className="p-4">
                      <Badge 
                        variant={getStatusBadgeVariant(client.onboardingStatus)}
                        className="text-xs"
                      >
                        {client.onboardingStatus.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${client.emailVerified ? 'bg-green-500' : 'bg-yellow-500'}`} />
                        <span className="text-xs text-gray-600">
                          {client.emailVerified ? 'Verified' : 'Pending'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-600">{client.gender || 'Not specified'}</td>
                    <td className="p-4 text-gray-600">{format(new Date(client.createdAt), "MMM dd, yyyy")}</td>
                    <td className="p-4 text-gray-600">
                      {client.lastActive ? format(new Date(client.lastActive), "MMM dd, yyyy") : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {filteredClients.length === 0 && clients.length > 0 && (
        <Card className="text-center py-8 md:py-12">
          <CardContent>
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Clients Found</h3>
            <p className="text-gray-600 mb-4 text-sm md:text-base px-4">
              No clients match your current search and filter criteria. Try adjusting your filters.
            </p>
            <Button 
              variant="outline" 
              onClick={() => {
                setSearchTerm("");
                setProductServiceFilter("all");
                setGenderFilter("all");
                setDurationFilter("all");
              }}
              className="w-full sm:w-auto"
            >
              Clear All Filters
            </Button>
          </CardContent>
        </Card>
      )}

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
      </div>
    </div>
  );
}