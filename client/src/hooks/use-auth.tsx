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
  role: "client" | "project_manager" | "staff" | "intern" | "operations_manager" | "team_lead";
  specialization?: string;
  productService?: string;
  clientType?: string;
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
          }
        });

        if (res.status === 401) return null;
        if (!res.ok) {
          console.error(`Failed to fetch user: ${res.status} ${res.statusText}`);
          return null;
        }

        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.error("Expected JSON response but got:", contentType);
          return null;
        }

        return res.json();
      } catch (err) {
        console.error("Error fetching user:", err);
        return null;
      }
    },
    retry: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(credentials),
        credentials: "include"
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Login failed");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Success",
        description: "Successfully logged in",
      });
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to login",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: {
      username: string;
      password: string;
      role: "client" | "project_manager" | "staff" | "intern" | "operations_manager" | "team_lead";
      name: string;
      email: string;
      specialization?: string;
      productService?: string;
      clientType?: string;
      breakOneTime?: string;
      breakTwoTime?: string;
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
      const res = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Accept": "application/json"
        }
      });

      if (!res.ok) throw new Error("Failed to logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear(); // Clear all queries on logout
      toast({
        title: "Success",
        description: "Successfully logged out",
      });
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

  // Set up SSE for real-time notifications
  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;
    console.log("Setting up SSE connection for notifications...");
    const eventSource = new EventSource("/api/notifications/stream");

    eventSource.onopen = () => {
      if (isMounted) {
        console.log("SSE connection opened for notifications");
      }
    };

    eventSource.onmessage = (event) => {
      if (!isMounted) return;

      try {
        const data = JSON.parse(event.data);
        console.log("SSE message received:", data);

        if (data.type === "notification") {
          // Invalidate notifications to refresh the list
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }).catch(console.error);
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error) => {
      if (isMounted) {
        console.error("SSE error:", error);
      }
    };

    return () => {
      isMounted = false;
      console.log("Closing SSE connection for notifications");
      eventSource.close();
    };
  }, [user?.id, queryClient]);


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