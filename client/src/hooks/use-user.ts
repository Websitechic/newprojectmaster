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
      // Logout from OneSignal - ALWAYS opt out and remove External User ID
      if (typeof window.OneSignalDeferred !== 'undefined') {
        try {
          await new Promise<void>((resolve) => {
            window.OneSignalDeferred.push(async (OneSignal: any) => {
              try {
                console.log('[OneSignal] 🚪 Logging out user from OneSignal...');
                
                // Detect if on mobile device
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                console.log('[OneSignal] 📱 Is Mobile Device:', isMobile);
                
                // Get current user info before logout
                try {
                  const currentUserId = await OneSignal.User.getExternalId();
                  console.log('[OneSignal] 📋 Current External User ID:', currentUserId);
                } catch (e) {
                  console.log('[OneSignal] ℹ️ No external ID to log');
                }
                
                // CRITICAL: First opt out from push to stop receiving notifications
                try {
                  console.log('[OneSignal] 🔕 Opting out from push notifications...');
                  await OneSignal.User.PushSubscription.optOut();
                  console.log('[OneSignal] ✅ Successfully opted out from push notifications');
                  
                  // Extra delay for mobile devices to ensure opt-out processes
                  if (isMobile) {
                    await new Promise(r => setTimeout(r, 1000));
                    console.log('[OneSignal] 📱 Mobile opt-out delay completed');
                  }
                } catch (optOutError) {
                  console.log('[OneSignal] ℹ️ OptOut not needed or already done:', optOutError);
                }
                
                // Additional step for mobile: Remove all external user IDs/aliases
                if (isMobile) {
                  try {
                    console.log('[OneSignal] 📱 Removing external user ID alias for mobile...');
                    await OneSignal.User.removeAlias("external_id");
                    console.log('[OneSignal] ✅ External ID alias removed');
                    await new Promise(r => setTimeout(r, 500));
                  } catch (aliasError) {
                    console.log('[OneSignal] ℹ️ Alias removal not needed:', aliasError);
                  }
                }
                
                // Small delay to let opt out process
                await new Promise(r => setTimeout(r, 500));
                
                // Then logout to dissociate the user completely
                await OneSignal.logout();
                console.log('[OneSignal] ✅ User logged out from OneSignal');
                
                // Extra verification and cleanup for mobile
                if (isMobile) {
                  await new Promise(r => setTimeout(r, 1000));
                  
                  // Try to verify the subscription was removed
                  try {
                    const isOptedIn = await OneSignal.User.PushSubscription.optedIn;
                    console.log('[OneSignal] 📱 Mobile subscription status after logout:', isOptedIn);
                    
                    // If still opted in on mobile, force opt-out again
                    if (isOptedIn) {
                      console.log('[OneSignal] 📱 Force opt-out on mobile device');
                      await OneSignal.User.PushSubscription.optOut();
                      await new Promise(r => setTimeout(r, 1000));
                    }
                  } catch (e) {
                    console.log('[OneSignal] ℹ️ Cannot verify mobile subscription status:', e);
                  }
                }
                
                // Verify logout
                try {
                  const afterLogoutId = await OneSignal.User.getExternalId();
                  console.log('[OneSignal] 📋 External User ID after logout:', afterLogoutId);
                } catch (e) {
                  console.log('[OneSignal] ✅ External ID successfully cleared');
                }
                
                resolve();
              } catch (error) {
                console.error('[OneSignal] ❌ Logout error:', error);
                resolve(); // Resolve anyway to not block logout
              }
            });
          });
          
          // Critical delay to ensure OneSignal fully processes the logout
          // Longer delay for mobile devices
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          const delay = isMobile ? 4000 : 3000;
          console.log(`[OneSignal] ⏳ Waiting ${delay/1000} seconds for logout to complete...`);
          await new Promise(resolve => setTimeout(resolve, delay));
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