import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InsertUser, SelectUser } from "@db/schema";

type RequestResult = {
  ok: true;
} | {
  ok: false;
  message: string;
};

async function handleRequest(
  url: string,
  method: string,
  body?: InsertUser
): Promise<RequestResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status >= 500) {
        return { ok: false, message: response.statusText };
      }

      const message = await response.text();
      return { ok: false, message };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.toString() };
  }
}

async function fetchUser(): Promise<SelectUser | null> {
  const response = await fetch('/api/user', {
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 401) {
      return null;
    }

    if (response.status >= 500) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export function useUser() {
  const queryClient = useQueryClient();

  const { data: user, error, isLoading } = useQuery<SelectUser | null, Error>({
    queryKey: ['user'],
    queryFn: fetchUser,
    staleTime: Infinity,
    retry: false
  });

  const loginMutation = useMutation<RequestResult, Error, InsertUser>({
    mutationFn: (userData) => handleRequest('/api/login', 'POST', userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const logoutMutation = useMutation<RequestResult, Error>({
    mutationFn: () => handleRequest('/api/logout', 'POST'),
    onSuccess: async (data) => {
      // Logout from OneSignal if needed
      if (data.logoutOneSignal && typeof window.OneSignalDeferred !== 'undefined') {
        try {
          await new Promise<void>((resolve) => {
            window.OneSignalDeferred.push(async (OneSignal: any) => {
              try {
                console.log('[OneSignal] 🚪 Logging out user from OneSignal...');
                
                // First logout to dissociate the user
                await OneSignal.logout();
                console.log('[OneSignal] ✅ User logged out from OneSignal');
                
                // Also opt out from push to remove device subscription
                try {
                  await OneSignal.User.PushSubscription.optOut();
                  console.log('[OneSignal] ✅ Opted out from push notifications');
                } catch (optOutError) {
                  console.log('[OneSignal] ℹ️ OptOut not needed or already done:', optOutError);
                }
                
                resolve();
              } catch (error) {
                console.error('[OneSignal] ❌ Logout error:', error);
                resolve(); // Resolve anyway to not block logout
              }
            });
          });
          
          // Critical delay to ensure OneSignal fully processes the logout
          console.log('[OneSignal] ⏳ Waiting 2 seconds for logout to complete...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('[OneSignal] ✅ Logout complete, proceeding with navigation');
        } catch (error) {
          console.error('[OneSignal] Failed to logout:', error);
        }
      }

      queryClient.setQueryData(["user"], null);
      window.location.href = "/";
    },
  });

  const registerMutation = useMutation<RequestResult, Error, InsertUser>({
    mutationFn: (userData) => handleRequest('/api/register', 'POST', userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    register: registerMutation.mutateAsync,
  };
}
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  specialization?: string;
  profileImage?: string;
  status?: string;
  clientType?: string;
  productService?: string;
}