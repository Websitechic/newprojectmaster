
import { useEffect, useRef } from 'react';

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export function useOneSignal(userId?: number) {
  const hasSubscribed = useRef(false);
  const initializationAttempted = useRef(false);

  useEffect(() => {
    const appId = (import.meta.env.VITE_ONESIGNAL_APP_ID as string) || '';
    
    console.log('[OneSignal] Hook triggered');
    console.log('[OneSignal] User ID:', userId);
    console.log('[OneSignal] App ID configured:', !!appId && appId !== 'YOUR_ONESIGNAL_APP_ID');
    
    if (!appId || appId === 'YOUR_ONESIGNAL_APP_ID') {
      console.error('[OneSignal] ❌ App ID not configured');
      return;
    }

    if (!userId) {
      console.log('[OneSignal] ⏸️ Waiting for user ID');
      return;
    }

    // Prevent multiple initialization attempts for the same user
    if (initializationAttempted.current) {
      console.log('[OneSignal] ⏸️ Initialization already attempted for this user');
      return;
    }

    const initializeOneSignal = async () => {
      try {
        initializationAttempted.current = true;
        console.log('[OneSignal] 🚀 Starting initialization process...');
        
        // Wait for OneSignal to be available on window
        let retries = 0;
        while (typeof window.OneSignalDeferred === 'undefined' && retries < 10) {
          console.log('[OneSignal] ⏳ Waiting for OneSignal SDK to load... (attempt', retries + 1, ')');
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }
        
        if (typeof window.OneSignalDeferred === 'undefined') {
          console.error('[OneSignal] ❌ OneSignal SDK failed to load after 5 seconds');
          initializationAttempted.current = false;
          return;
        }
        
        if (!isInitialized && !initPromise) {
          console.log('[OneSignal] 📦 Initializing SDK...');
          
          initPromise = new Promise((resolve, reject) => {
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            window.OneSignalDeferred.push(async (OneSignal: any) => {
              try {
                await OneSignal.init({
                  appId: appId,
                  allowLocalhostAsSecureOrigin: true,
                  notifyButton: {
                    enable: false,
                  },
                });
                
                isInitialized = true;
                console.log('[OneSignal] ✅ SDK initialized successfully');
                resolve();
              } catch (error) {
                console.error('[OneSignal] ❌ Initialization failed:', error);
                initializationAttempted.current = false;
                reject(error);
              }
            });
          });
          
          await initPromise;
        } else if (initPromise) {
          console.log('[OneSignal] ⏳ Waiting for existing initialization...');
          await initPromise;
        }
        
        // Check if we've already processed this user
        if (hasSubscribed.current) {
          console.log('[OneSignal] ✓ User already processed in this session');
          return;
        }
        
        // Wait a bit longer to ensure user is fully authenticated
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            // Set external user ID for this user using the recommended login method
            console.log('[OneSignal] 👤 Setting external user ID:', userId);
            
            // First, ensure any previous user is logged out
            try {
              await OneSignal.logout();
              console.log('[OneSignal] 🔄 Logged out any previous user');
            } catch (logoutError) {
              console.log('[OneSignal] ℹ️ No previous user to logout or logout failed:', logoutError);
            }
            
            // CRITICAL: Wait even longer for logout to fully complete before login
            console.log('[OneSignal] ⏳ Waiting 2.5 seconds for logout to complete...');
            await new Promise(resolve => setTimeout(resolve, 2500));
            
            // Use login method which handles aliases automatically
            try {
              await OneSignal.login(userId.toString());
              console.log('[OneSignal] ✅ Login method succeeded');
              
              // Wait for login to fully process
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Ensure the alias is properly set
              await OneSignal.User.addAlias("external_id", userId.toString());
              console.log('[OneSignal] ✅ External ID alias added');
            } catch (loginError) {
              console.warn('[OneSignal] ⚠️ Login failed, trying direct alias:', loginError);
              try {
                await OneSignal.User.addAlias("external_id", userId.toString());
                console.log('[OneSignal] ✅ External ID alias set successfully');
              } catch (aliasError) {
                console.error('[OneSignal] ❌ Failed to set external ID:', aliasError);
                throw aliasError;
              }
            }
            
            console.log('[OneSignal] ✅ External user ID set successfully');
            
            // Check if push is supported
            const isPushSupported = OneSignal.Notifications.isPushSupported();
            console.log('[OneSignal] 📱 Push supported:', isPushSupported);
            
            if (!isPushSupported) {
              console.warn('[OneSignal] ⚠️ Push notifications not supported on this browser');
              hasSubscribed.current = true; // Mark as processed to avoid retries
              return;
            }
            
            // Check current permission state
            let permission;
            try {
              permission = await OneSignal.Notifications.permissionNative;
              console.log('[OneSignal] 🔐 Native permission:', permission);
            } catch (permError) {
              console.error('[OneSignal] ❌ Error getting permission:', permError);
              return;
            }
            
            // Handle permission states
            if (permission === 'default') {
              // Permission not yet requested - DON'T auto-prompt
              console.log('[OneSignal] 🔔 Permission not yet requested');
              console.log('[OneSignal] 💡 User can enable notifications from their profile or settings');
              hasSubscribed.current = true; // Mark as processed
              
              // Store that we can prompt later if needed
              try {
                localStorage.setItem(`onesignal_can_prompt_${userId}`, 'true');
              } catch (e) {
                console.warn('[OneSignal] Could not set localStorage');
              }
            } else if (permission === 'granted') {
              // Permission already granted - ensure subscription is active
              console.log('[OneSignal] ✅ Permission already granted');
              
              try {
                const optedIn = await OneSignal.User.PushSubscription.optedIn;
                console.log('[OneSignal] 📊 Current opt-in status:', optedIn);
                
                if (!optedIn) {
                  console.log('[OneSignal] 🔄 Opting in user...');
                  await OneSignal.User.PushSubscription.optIn();
                  console.log('[OneSignal] ✅ User opted in successfully');
                } else {
                  console.log('[OneSignal] ✅ User already opted in');
                }
                
                hasSubscribed.current = true;
              } catch (optInError) {
                console.error('[OneSignal] ❌ Error opting in user:', optInError);
                // Don't mark as subscribed if opt-in failed
              }
            } else if (permission === 'denied') {
              console.warn('[OneSignal] ⛔ Notifications blocked by user - cannot subscribe');
              console.warn('[OneSignal] 💡 User needs to enable notifications in browser settings');
              hasSubscribed.current = true; // Mark as processed to avoid retries
            }
            
            // Log final subscription status
            try {
              const subscriptionId = await OneSignal.User.PushSubscription.id;
              const token = await OneSignal.User.PushSubscription.token;
              const optedIn = await OneSignal.User.PushSubscription.optedIn;
              
              console.log('[OneSignal] 📊 Final Status:');
              console.log('   - External User ID:', userId);
              console.log('   - Subscription ID:', subscriptionId ? subscriptionId.substring(0, 8) + '...' : 'None');
              console.log('   - Has Token:', !!token);
              console.log('   - Opted In:', optedIn);
              
              // Store subscription status
              if (optedIn && subscriptionId) {
                try {
                  localStorage.setItem(`onesignal_subscribed_${userId}`, 'true');
                } catch (e) {
                  console.warn('[OneSignal] Could not set localStorage');
                }
              }
            } catch (err) {
              console.log('[OneSignal] ℹ️ Could not get final status:', err);
            }
          } catch (error) {
            console.error('[OneSignal] ❌ Setup error:', error);
            hasSubscribed.current = false; // Allow retry on next mount
            initializationAttempted.current = false;
          }
        });
        
      } catch (error) {
        console.error('[OneSignal] ❌ Initialization error:', error);
        console.error('[OneSignal] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        hasSubscribed.current = false; // Allow retry
        initializationAttempted.current = false;
      }
    };

    initializeOneSignal();
    
    // Cleanup function
    return () => {
      console.log('[OneSignal] Hook cleanup for user:', userId);
      
      // When user changes, logout from OneSignal to remove the old user association
      if (typeof window.OneSignalDeferred !== 'undefined' && userId) {
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            console.log('[OneSignal] 🔄 Cleanup - Logging out previous user:', userId);
            
            // First opt out from push
            try {
              await OneSignal.User.PushSubscription.optOut();
              console.log('[OneSignal] ✅ Cleanup - Opted out from push');
            } catch (optOutError) {
              console.log('[OneSignal] ℹ️ Cleanup - OptOut not needed:', optOutError);
            }
            
            // Wait for opt out to process
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Then logout to dissociate user
            await OneSignal.logout();
            console.log('[OneSignal] ✅ Cleanup - Previous user logged out');
            
            // Longer delay to ensure cleanup completes
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.warn('[OneSignal] ⚠️ Error in cleanup logout:', error);
          }
        });
      }
      
      // Reset flags when user changes
      hasSubscribed.current = false;
      initializationAttempted.current = false;
    };
  }, [userId]);
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    OneSignalDeferred: Array<(oneSignal: any) => void>;
  }
}
