
import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/hooks/use-user";
import { useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, Briefcase, Award, Clock, Key, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ProfilePage() {
  const [location] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const resetPasswordMutation = useMutation({
    mutationFn: async (password: string) => {
      const response = await fetch("/api/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword: password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reset password");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Password reset successfully",
      });
      setIsResetDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleResetPassword = () => {
    if (!newPassword || !confirmPassword) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate(newPassword);
  };

  const formatRole = (role: string) => {
    return role.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatBreakTime = (minutes?: number) => {
    if (!minutes) return "Not set";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full max-w-full overflow-hidden">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 max-w-full">
        <Header />
        <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 w-full max-w-full">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3 w-full max-w-full overflow-hidden">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">My Profile</h1>
                <p className="text-gray-600 mt-1 text-xs sm:text-sm md:text-base truncate">
                  View and manage your account information
                </p>
              </div>
            </div>

            {/* Profile Information Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-2xl font-medium">
                      {user.name?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div>
                    <CardTitle className="text-xl sm:text-2xl">{user.name}</CardTitle>
                    <CardDescription className="text-sm sm:text-base">
                      {formatRole(user.role)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Personal Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-600">
                      <User className="h-4 w-4" />
                      Full Name
                    </Label>
                    <p className="text-base font-medium">{user.name}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-600">
                      <User className="h-4 w-4" />
                      Username
                    </Label>
                    <p className="text-base font-medium">{user.username}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-600">
                      <Mail className="h-4 w-4" />
                      Email Address
                    </Label>
                    <p className="text-base font-medium break-all">{user.email}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-600">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </Label>
                    <p className="text-base font-medium">{user.phoneNumber || "Not provided"}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-600">
                      <Briefcase className="h-4 w-4" />
                      Role
                    </Label>
                    <p className="text-base font-medium">{formatRole(user.role)}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-600">
                      <Award className="h-4 w-4" />
                      Specialization
                    </Label>
                    <p className="text-base font-medium">
                      {user.specialization ? formatRole(user.specialization) : "Not specified"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-600">
                      <Clock className="h-4 w-4" />
                      Daily Break Time
                    </Label>
                    <p className="text-base font-medium">{user.breakOneTime || "Not set"}</p>
                  </div>
                </div>

                {/* Reset Password Section */}
                <div className="border-t pt-6">
                  <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-auto">
                        <Key className="h-4 w-4 mr-2" />
                        Reset Password
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md mx-4">
                      <DialogHeader>
                        <DialogTitle>Reset Password</DialogTitle>
                        <DialogDescription>
                          Enter your new password below. Make sure it's at least 6 characters long.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="newPassword">New Password</Label>
                          <div className="relative">
                            <Input
                              id="newPassword"
                              type={showNewPassword ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Enter new password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                            >
                              {showNewPassword ? (
                                <EyeOff className="h-4 w-4 text-gray-400" />
                              ) : (
                                <Eye className="h-4 w-4 text-gray-400" />
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm Password</Label>
                          <div className="relative">
                            <Input
                              id="confirmPassword"
                              type={showConfirmPassword ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Confirm new password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4 text-gray-400" />
                              ) : (
                                <Eye className="h-4 w-4 text-gray-400" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsResetDialogOpen(false);
                            setNewPassword("");
                            setConfirmPassword("");
                          }}
                          className="w-full sm:w-auto"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleResetPassword}
                          disabled={resetPasswordMutation.isPending}
                          className="w-full sm:w-auto"
                        >
                          {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
