import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"client" | "project_manager" | "staff" | "intern" | "product_owner" | "operations_manager" | "team_lead">("staff");
  const [specialization, setSpecialization] = useState("");
  const [productService, setProductService] = useState("");
  const [clientType, setClientType] = useState("");
  const [breakOneTime, setBreakOneTime] = useState("");
  const [breakTwoTime, setBreakTwoTime] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const { loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isLogin) {
        await loginMutation.mutateAsync({ username, password });
      } else {
        // Validate specialization for staff and intern users
        if ((role === "staff" || role === "intern") && !specialization) {
          toast({
            title: "Error",
            description: "Please select a specialization",
            variant: "destructive",
          });
          return;
        }

        // Validate product/service and client type for client users
        if (role === "client") {
          if (!productService || !clientType) {
            toast({
              title: "Error",
              description: "Please select both Product/Service and Client Type",
              variant: "destructive",
            });
            return;
          }
        }

        // Validate break time for non-client users
        if (role !== "client") {
          if (!breakOneTime) {
            toast({
              title: "Error",
              description: "Please select a break time",
              variant: "destructive",
            });
            return;
          }
        }

        await registerMutation.mutateAsync({
          username,
          password,
          name,
          email,
          role,
          specialization: (role === "staff" || role === "intern") ? specialization : undefined,
          productService: role === "client" ? productService : undefined,
          clientType: role === "client" ? clientType : undefined,
          breakOneTime: role !== "client" ? breakOneTime : undefined,
          breakTwoTime: undefined
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Not implemented",
      description: "Password reset functionality will be added soon.",
      variant: "destructive",
    });
  };

  if (resetMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="auth-form-container">
          <CardHeader className="text-center">
            <h1 className="text-2xl font-bold">Reset Password</h1>
          </CardHeader>
          <form onSubmit={handleReset}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full">
                Send Reset Link
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setResetMode(false)}
                className="w-full"
              >
                Back to Login
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="auth-form-container">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold">
            {isLogin ? "Login" : "Register"}
          </h1>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={(value: "client" | "project_manager" | "staff" | "intern" | "product_owner" | "operations_manager" | "team_lead") => setRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="project_manager">Project Manager</SelectItem>
                      <SelectItem value="product_owner">Product Owner</SelectItem>
                      <SelectItem value="operations_manager">Operations Manager</SelectItem>
                      <SelectItem value="team_lead">Team Lead</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="intern">Intern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(role === "staff" || role === "intern") && (
                  <div className="space-y-2">
                    <Label htmlFor="specialization">Specialization</Label>
                    <Select value={specialization} onValueChange={setSpecialization}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your specialization" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="automation">Automation</SelectItem>
                        <SelectItem value="copywriting">Copy Writing</SelectItem>
                        <SelectItem value="design">Design</SelectItem>
                        <SelectItem value="media_buying">Media Buying</SelectItem>
                        <SelectItem value="development">Development</SelectItem>
                        <SelectItem value="community_manager">Community Manager</SelectItem>
                        <SelectItem value="technical_support">Technical Support</SelectItem>
                        <SelectItem value="replit_development">Replit Development</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {role === "client" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="productService">Product/Service</Label>
                      <Select value={productService} onValueChange={setProductService}>
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
                      <Select value={clientType} onValueChange={setClientType}>
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
                {role !== "client" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="breakOneTime">Daily Break Time</Label>
                      <Input
                        id="breakOneTime"
                        type="time"
                        value={breakOneTime}
                        onChange={(e) => setBreakOneTime(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full">
              {isLogin ? "Login" : "Register"}
            </Button>
            <div className="flex justify-between w-full">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? "Need an account? Register" : "Already have an account? Login"}
              </Button>
              {isLogin && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setResetMode(true)}
                >
                  Forgot Password?
                </Button>
              )}
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}