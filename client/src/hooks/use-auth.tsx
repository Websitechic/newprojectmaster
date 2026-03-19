import { ReactNode, createContext, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface User {
  id: number;
  username: string;
  name: string;
  role: string;
  specialization?: string;
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<{ message: string; user: User }, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<{ message: string; user: User }, Error, RegisterData>;
};

type LoginData = {
  username: string;
  password: string;
};

type RegisterData = LoginData & {
  name: string;
  email: string;
  role: string;
  specialization?: string;
  productService?: string;
  clientType?: string;
  breakOneTime?: string;
  breakTwoTime?: string;
  projectManagerType?: string;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/user", {
          credentials: "include",
          headers: {
            "Accept": "application/json",
          },
          cache: "no-cache"
        });

        if (res.status === 401) {
          console.log("User not authenticated (401)");
          return null;
        }
        if (!res.ok) {
          console.error(`Failed to fetch user: ${res.status} ${res.statusText}`);
          return null;
        }

        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.error("Expected JSON response but got:", contentType);
          return null;
        }

        const userData = await res.json();
        console.log("User authenticated successfully:", userData?.id);
        return userData;
      } catch (err) {
        console.error("Error fetching user:", err);
        return null;
      }
    },
    retry: false,
    staleTime: 10000, // Consider data fresh for 10 seconds
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnReconnect: true // Refetch when reconnecting
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log('🔐 Client: Starting login mutation');
      
      if (!credentials.username || !credentials.password) {
        throw new Error("Username and password are required");
      }

      console.log('🔐 Client: Sending login request for user:', credentials.username);
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(credentials),
        credentials: "include"
      });

      console.log('🔐 Client: Login response status:', res.status);

      if (!res.ok) {
        let errorMessage;
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error || "Login failed";
          console.error('🔐 Client: Login error response:', errorData);
        } catch (parseError) {
          errorMessage = await res.text();
          console.error('🔐 Client: Login error text:', errorMessage);
        }
        throw new Error(errorMessage || "Invalid username or password");
      }

      const data = await res.json();
      console.log('🔐 Client: Login successful for user:', data.user?.username);
      return data;
    },
    onSuccess: (data) => {
      console.log('🔐 Client: Setting user data in query cache');
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Success",
        description: "Successfully logged in",
      });
    },
    onError: (error: Error) => {
      console.error("🔐 Client: Login error:", error);
      console.error("🔐 Client: Error message:", error.message);
      console.error("🔐 Client: Error stack:", error.stack);
      if (error.message === "MUST_SET_PASSWORD") {
        toast({
          title: "Password Setup Required",
          description: "You need to set your password first. Redirecting...",
        });
        window.location.href = "/setup-password";
        return;
      }
      toast({
        title: "Login Failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: {
      username: string;
      password: string;
      role: string;
      name: string;
      email: string;
      specialization?: string;
      productService?: string;
      clientType?: string;
      breakOneTime?: string;
      breakTwoTime?: string;
      projectManagerType?: string;
    }) => {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(data),
        credentials: "include"
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Registration failed");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Success",
        description: "Successfully registered",
      });
    },
    onError: (error: Error) => {
      console.error("Registration error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to register",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      window.location.href = "/auth";
      fetch("/api/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Accept": "application/json"
        }
      }).catch((err) => console.error("Logout request error:", err));
    },
    onError: (error: Error) => {
      console.error("Logout error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to logout",
        variant: "destructive",
      });
    },
  });

  // SSE connection is now centralized in GlobalNotificationListener (App.tsx)
  // to prevent multiple connections overwriting each other on the server


  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Hook for notifications - removed as notifications are now handled in NotificationsDropdown
export const useNotifications = () => {
  // This hook is now empty as SSE connection is handled in NotificationsDropdown component
  // to avoid duplicate connections and improve reliability
};