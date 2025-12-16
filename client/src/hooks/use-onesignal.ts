
import { useEffect, useRef } from 'react';

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export function useOneSignal(userId?: number) {
  const hasSubscribed = useRef(false);

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

    const initializeOneSignal = async () => {
      try {
        console.log('[OneSignal] 🚀 Starting initialization process...');
        
        // Wait for OneSignal to be available on window
        if (typeof window.OneSignalDeferred === 'undefined') {
          console.log('[OneSignal] ⏳ Waiting for OneSignal SDK to load...');
          await new Promise(resolve => setTimeout(resolve, 1000));
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
        
        // Use the global OneSignal instance
        await new Promise(resolve => setTimeout(resolve, 500));
        
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            // Set external user ID for this user
            console.log('[OneSignal] 👤 Setting external user ID:', userId);
            await OneSignal.login(userId.toString());
            console.log('[OneSignal] ✅ External user ID set successfully');
            
            // Check if push is supported
            const isPushSupported = OneSignal.Notifications.isPushSupported();
            console.log('[OneSignal] 📱 Push supported:', isPushSupported);
            
            if (!isPushSupported) {
              console.warn('[OneSignal] ⚠️ Push notifications not supported on this browser');
              return;
            }
            
            // Check current permission state
            const permission = await OneSignal.Notifications.permissionNative;
            console.log('[OneSignal] 🔐 Native permission:', permission);
            
            // Handle permission states
            if (permission === 'default') {
              // Permission not yet requested - show prompt
              console.log('[OneSignal] 🔔 Requesting notification permission...');
              
              try {
                await OneSignal.Slidedown.promptPush();
                console.log('[OneSignal] 📊 Permission prompt shown');
                
                // Wait for user interaction
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Check permission again after prompt
                const newPermission = await OneSignal.Notifications.permissionNative;
                console.log('[OneSignal] 🔐 Permission after prompt:', newPermission);
                
                if (newPermission === 'granted') {
                  console.log('[OneSignal] ✅ Permission granted by user!');
                  await OneSignal.User.PushSubscription.optIn();
                  console.log('[OneSignal] ✅ User opted in successfully');
                  hasSubscribed.current = true;
                }
              } catch (promptError) {
                console.error('[OneSignal] ❌ Error with permission prompt:', promptError);
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
              }
            } else if (permission === 'denied') {
              console.warn('[OneSignal] ⛔ Notifications blocked by user - cannot subscribe');
              console.warn('[OneSignal] 💡 User needs to enable notifications in browser settings');
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
            } catch (err) {
              console.log('[OneSignal] ℹ️ Could not get final status:', err);
            }
          } catch (error) {
            console.error('[OneSignal] ❌ Setup error:', error);
          }
        });
        
      } catch (error) {
        console.error('[OneSignal] ❌ Initialization error:', error);
        console.error('[OneSignal] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    };

    initializeOneSignal();
    
  }, [userId]);
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    OneSignalDeferred: Array<(oneSignal: any) => void>;
  }
}
