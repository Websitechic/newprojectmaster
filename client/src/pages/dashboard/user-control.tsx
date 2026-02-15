import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/hooks/use-user";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Search, Edit, UserX, Clock, Briefcase, Award, AlertTriangle, UserPlus, Copy, CheckCircle } from "lucide-react";

interface UserData {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
  specialization: string | null;
  breakOneTime: string | null;
  isActive: boolean;
}

const roles = [
  { value: "staff", label: "Staff" },
  { value: "intern", label: "Intern" },
  { value: "project_manager", label: "Project Manager" },
  { value: "customer_support_officer", label: "Customer Support Officer" },
  { value: "team_lead", label: "Team Lead" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "client", label: "Client" },
];

const specializations = [
  { value: "customer_support_officer", label: "Customer Support Officer" },
  { value: "product_manager", label: "Product Manager" },
  { value: "automation", label: "Automation" },
  { value: "copywriting", label: "Copywriting" },
  { value: "design", label: "Design" },
  { value: "media_buying", label: "Media Buying" },
  { value: "development", label: "Development" },
  { value: "community_manager", label: "Community Manager" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "technical_support", label: "Technical Support" },
  { value: "replit_development", label: "Replit Development" },
];

export default function UserControl() {
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<UserData | null>(null);
  const [activatingUser, setActivatingUser] = useState<UserData | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createdUserInfo, setCreatedUserInfo] = useState<{ username: string; setupToken: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [formData, setFormData] = useState({
    role: "",
    specialization: "",
    breakOneTime: "",
  });
  const [createFormData, setCreateFormData] = useState({
    username: "",
    name: "",
    email: "",
    role: "staff",
    specialization: "",
    breakOneTime: "",
    productService: "",
    clientType: "",
    projectManagerType: "",
  });

  const isAuthorized = user?.role === "team_lead" || user?.role === "operations_manager" || user?.specialization === "operations_manager";

  const { data: allUsers = [], isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/user-control/users"],
    enabled: isAuthorized,
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: { userId: number; role?: string; specialization?: string; breakOneTime?: string }) => {
      const response = await fetch(`/api/user-control/${data.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          role: data.role,
          specialization: data.specialization,
          breakOneTime: data.breakOneTime,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update user");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-control/users"] });
      setEditingUser(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deactivateUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/user-control/${userId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: false }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to deactivate user");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User account deactivated" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-control/users"] });
      setDeactivatingUser(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const activateUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/user-control/${userId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: true }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to activate user");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User account activated" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-control/users"] });
      setActivatingUser(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof createFormData) => {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: data.username,
          password: "temporary",
          name: data.name,
          email: data.email,
          role: data.role,
          specialization: (data.role === "staff" || data.role === "intern") ? data.specialization : undefined,
          breakOneTime: data.role !== "client" ? data.breakOneTime : undefined,
          productService: data.role === "client" ? data.productService : undefined,
          clientType: data.role === "client" ? data.clientType : undefined,
          projectManagerType: data.role === "project_manager" ? data.projectManagerType : undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create user");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: "User account created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-control/users"] });
      setCreatedUserInfo({
        username: data.user.username,
        setupToken: data.setupToken,
      });
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEditUser = (userData: UserData) => {
    setEditingUser(userData);
    setFormData({
      role: userData.role || "",
      specialization: userData.specialization || "",
      breakOneTime: userData.breakOneTime || "",
    });
  };

  const handleSaveChanges = () => {
    if (!editingUser) return;
    updateUserMutation.mutate({
      userId: editingUser.id,
      role: formData.role,
      specialization: formData.specialization || undefined,
      breakOneTime: formData.breakOneTime || undefined,
    });
  };

  const handleDeactivate = () => {
    if (!deactivatingUser) return;
    deactivateUserMutation.mutate(deactivatingUser.id);
  };

  const handleCreateUser = () => {
    if (!createFormData.username || !createFormData.name || !createFormData.email) {
      toast({ title: "Error", description: "Username, name, and email are required", variant: "destructive" });
      return;
    }
    if (createFormData.role !== "client" && !createFormData.breakOneTime) {
      toast({ title: "Error", description: "Break time is required for non-client users", variant: "destructive" });
      return;
    }
    if ((createFormData.role === "staff" || createFormData.role === "intern") && !createFormData.specialization) {
      toast({ title: "Error", description: "Specialization is required", variant: "destructive" });
      return;
    }
    if (createFormData.role === "project_manager" && !createFormData.projectManagerType) {
      toast({ title: "Error", description: "Project manager type is required", variant: "destructive" });
      return;
    }
    if (createFormData.role === "client" && (!createFormData.productService || !createFormData.clientType)) {
      toast({ title: "Error", description: "Product/Service and Client Type are required for clients", variant: "destructive" });
      return;
    }
    createUserMutation.mutate(createFormData);
  };

  const handleCopyToken = () => {
    if (createdUserInfo) {
      navigator.clipboard.writeText(createdUserInfo.setupToken);
      setCopiedToken(true);
      toast({ title: "Copied", description: "Setup token copied to clipboard" });
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const resetCreateForm = () => {
    setCreateFormData({
      username: "",
      name: "",
      email: "",
      role: "staff",
      specialization: "",
      breakOneTime: "",
      productService: "",
      clientType: "",
      projectManagerType: "",
    });
  };

  const filteredUsers = allUsers.filter((u: UserData) =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatRole = (role: string) => {
    return role.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (!isAuthorized) {
    return (
      <div className="flex h-screen w-full">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
              <p className="text-gray-600 mt-2">You don't have permission to access this page.</p>
              <Button className="mt-4" onClick={() => setLocation("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Users className="h-6 w-6" />
                  User Control
                </h1>
                <p className="text-gray-600 mt-1">
                  Manage user roles, specializations, and account status
                </p>
              </div>
              <Button onClick={() => { resetCreateForm(); setShowCreateDialog(true); }} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Create New User
              </Button>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search users by name, email, or username..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No users found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Name</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Email</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Role</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Specialization</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Break Time</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((userData: UserData) => (
                          <tr key={userData.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div className="font-medium">{userData.name}</div>
                              <div className="text-sm text-gray-500">@{userData.username}</div>
                            </td>
                            <td className="py-3 px-4 text-sm">{userData.email}</td>
                            <td className="py-3 px-4">
                              <Badge variant="outline">{formatRole(userData.role)}</Badge>
                            </td>
                            <td className="py-3 px-4 text-sm">
                              {userData.specialization ? formatRole(userData.specialization) : "-"}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              {userData.breakOneTime || "-"}
                            </td>
                            <td className="py-3 px-4">
                              <Badge className={userData.isActive !== false ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                {userData.isActive !== false ? "Active" : "Inactive"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditUser(userData)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {userData.role !== "team_lead" && (
                                  userData.isActive !== false ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-red-600 hover:text-red-700"
                                      onClick={() => setDeactivatingUser(userData)}
                                    >
                                      <UserX className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-green-600 hover:text-green-700"
                                      onClick={() => setActivatingUser(userData)}
                                    >
                                      <Users className="h-4 w-4" />
                                    </Button>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) setShowCreateDialog(false); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Create a new account. The user will receive a setup token to set their own password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Username *</Label>
              <Input
                value={createFormData.username}
                onChange={(e) => setCreateFormData({ ...createFormData, username: e.target.value })}
                placeholder="Enter username"
              />
            </div>
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={createFormData.name}
                onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
                placeholder="Enter full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={createFormData.email}
                onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                placeholder="Enter email"
              />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={createFormData.role} onValueChange={(value) => setCreateFormData({ ...createFormData, role: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {createFormData.role === "project_manager" && (
              <div className="space-y-2">
                <Label>Project Manager Type *</Label>
                <Select value={createFormData.projectManagerType} onValueChange={(value) => setCreateFormData({ ...createFormData, projectManagerType: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Main</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(createFormData.role === "staff" || createFormData.role === "intern") && (
              <div className="space-y-2">
                <Label>Specialization *</Label>
                <Select value={createFormData.specialization} onValueChange={(value) => setCreateFormData({ ...createFormData, specialization: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select specialization" />
                  </SelectTrigger>
                  <SelectContent>
                    {specializations.map((spec) => (
                      <SelectItem key={spec.value} value={spec.value}>
                        {spec.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {createFormData.role === "client" && (
              <>
                <div className="space-y-2">
                  <Label>Product/Service *</Label>
                  <Select value={createFormData.productService} onValueChange={(value) => setCreateFormData({ ...createFormData, productService: value })}>
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
                  <Label>Client Type *</Label>
                  <Select value={createFormData.clientType} onValueChange={(value) => setCreateFormData({ ...createFormData, clientType: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project_client">Project Client</SelectItem>
                      <SelectItem value="support_maintenance_client">Support & Maintenance Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {createFormData.role !== "client" && (
              <div className="space-y-2">
                <Label>Daily Break Time *</Label>
                <Input
                  type="time"
                  value={createFormData.breakOneTime}
                  onChange={(e) => setCreateFormData({ ...createFormData, breakOneTime: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Setup Token Result Dialog */}
      <Dialog open={!!createdUserInfo} onOpenChange={(open) => { if (!open) setCreatedUserInfo(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Account Created
            </DialogTitle>
            <DialogDescription>
              The account for <strong>{createdUserInfo?.username}</strong> has been created. Share the setup token below with the user so they can set their password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={createdUserInfo?.username || ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Password Setup Token</Label>
              <div className="flex gap-2">
                <Input
                  value={createdUserInfo?.setupToken || ""}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="sm" onClick={handleCopyToken} className="shrink-0">
                  {copiedToken ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The new user should go to the password setup page, enter their username and this token to set their password.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedUserInfo(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Modify role, specialization, and break time for {editingUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Role
              </Label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Award className="h-4 w-4" />
                Specialization
              </Label>
              <Select value={formData.specialization || "none"} onValueChange={(value) => setFormData({ ...formData, specialization: value === "none" ? "" : value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select specialization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {specializations.map((spec) => (
                    <SelectItem key={spec.value} value={spec.value}>
                      {spec.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Daily Break Time (e.g., 10:00)
              </Label>
              <Input
                type="time"
                value={formData.breakOneTime}
                onChange={(e) => setFormData({ ...formData, breakOneTime: e.target.value })}
                placeholder="HH:mm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveChanges} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate User Dialog */}
      <Dialog open={!!deactivatingUser} onOpenChange={(open) => !open && setDeactivatingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Deactivate User Account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate {deactivatingUser?.name}'s account? They will no longer be able to log in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivatingUser(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={deactivateUserMutation.isPending}>
              {deactivateUserMutation.isPending ? "Deactivating..." : "Deactivate Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate User Dialog */}
      <Dialog open={!!activatingUser} onOpenChange={(open) => !open && setActivatingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Users className="h-5 w-5" />
              Activate User Account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to reactivate {activatingUser?.name}'s account? They will be able to log in again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivatingUser(null)}>
              Cancel
            </Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => activatingUser && activateUserMutation.mutate(activatingUser.id)} disabled={activateUserMutation.isPending}>
              {activateUserMutation.isPending ? "Activating..." : "Activate Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
