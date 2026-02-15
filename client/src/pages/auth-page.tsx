import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff } from "lucide-react";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("staff");
  const [specialization, setSpecialization] = useState("");
  const [productService, setProductService] = useState("");
  const [clientType, setClientType] = useState("");
  const [breakOneTime, setBreakOneTime] = useState("");
  const [breakTwoTime, setBreakTwoTime] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    role: "staff",
    name: "",
    email: "",
    specialization: "",
    gender: "",
    productService: "",
    clientType: "",
    projectManagerType: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isLogin) {
        // Validate login credentials
        if (!formData.username || !formData.password) {
          toast({
            title: "Error",
            description: "Please enter both username and password",
            variant: "destructive",
          });
          return;
        }

        await loginMutation.mutateAsync({ 
          username: formData.username, 
          password: formData.password 
        });
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

        // Validate project manager type for project manager users
        if (role === "project_manager" && !formData.projectManagerType) {
          toast({
            title: "Error",
            description: "Please select a project manager type",
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

        const registerData: any = {
          username: formData.username,
          password: formData.password,
          name: formData.name,
          email: formData.email,
          role: role,
          specialization: (role === "staff" || role === "intern") ? specialization : undefined,
          productService: role === "client" ? productService : undefined,
          clientType: role === "client" ? clientType : undefined,
          breakOneTime: role !== "client" ? breakOneTime : undefined,
          projectManagerType: role === "project_manager" ? formData.projectManagerType : undefined,
        };

        await registerMutation.mutateAsync(registerData);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Login failed. Please check your credentials.",
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
            Login
          </h1>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full">
              Login
            </Button>
            <div className="flex flex-col gap-2 w-full">
              <div className="flex justify-end w-full">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setResetMode(true)}
                >
                  Forgot Password?
                </Button>
              </div>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}