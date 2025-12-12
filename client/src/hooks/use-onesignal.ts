
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
        
        // Load OneSignal SDK
        const OneSignalModule = await import('react-onesignal');
        const OneSignal = OneSignalModule.default;
        
        if (!isInitialized && !initPromise) {
          console.log('[OneSignal] 📦 Initializing SDK...');
          
          initPromise = OneSignal.init({
            appId: appId,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: {
              enable: false,
            },
            serviceWorkerParam: {
              scope: '/',
            },
            serviceWorkerPath: '/OneSignalSDKWorker.js',
          }).then(() => {
            isInitialized = true;
            console.log('[OneSignal] ✅ SDK initialized successfully');
          });
          
          await initPromise;
        } else if (initPromise) {
          console.log('[OneSignal] ⏳ Waiting for existing initialization...');
          await initPromise;
        }
        
        // Check if we've already subscribed this user
        if (hasSubscribed.current) {
          console.log('[OneSignal] ✓ User already subscribed in this session');
          return;
        }
        
        // Get OneSignal SDK instance
        const OneSignalModule2 = await import('react-onesignal');
        const OneSignal2 = OneSignalModule2.default;
        
        // Check current permission state
        const permission = await OneSignal2.Notifications.permission;
        console.log('[OneSignal] 🔔 Current permission state:', permission);
        
        // Login user to OneSignal
        console.log('[OneSignal] 👤 Logging in user:', userId);
        await OneSignal2.login(userId.toString());
        console.log('[OneSignal] ✅ User logged in successfully');
        
        // Check if user is already subscribed
        const isPushSupported = await OneSignal2.Notifications.isPushSupported();
        console.log('[OneSignal] 📱 Push supported:', isPushSupported);
        
        if (!isPushSupported) {
          console.warn('[OneSignal] ⚠️ Push notifications not supported on this browser');
          return;
        }
        
        const permissionNative = await OneSignal2.Notifications.permissionNative;
        console.log('[OneSignal] 🔐 Native permission:', permissionNative);
        
        // If permission is default (not granted or denied), show prompt
        if (permissionNative === 'default') {
          console.log('[OneSignal] 🔔 Requesting notification permission...');
          
          try {
            // Use the slidedown prompt
            const didShow = await OneSignal2.Slidedown.promptPush();
            console.log('[OneSignal] 📊 Slidedown shown:', didShow);
            
            // Wait a bit for user interaction
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check permission again
            const newPermission = await OneSignal2.Notifications.permissionNative;
            console.log('[OneSignal] 🔐 Permission after prompt:', newPermission);
            
            if (newPermission === 'granted') {
              console.log('[OneSignal] ✅ Permission granted!');
              hasSubscribed.current = true;
            } else if (newPermission === 'denied') {
              console.warn('[OneSignal] ❌ Permission denied by user');
            }
          } catch (promptError) {
            console.error('[OneSignal] ❌ Error showing permission prompt:', promptError);
          }
        } else if (permissionNative === 'granted') {
          console.log('[OneSignal] ✅ Permission already granted');
          hasSubscribed.current = true;
          
          // Ensure user is subscribed
          try {
            const optedIn = await OneSignal2.User.PushSubscription.optedIn;
            console.log('[OneSignal] 📊 User opted in:', optedIn);
            
            if (!optedIn) {
              console.log('[OneSignal] 🔄 Opting in user...');
              await OneSignal2.User.PushSubscription.optIn();
              console.log('[OneSignal] ✅ User opted in successfully');
            }
          } catch (optInError) {
            console.error('[OneSignal] ❌ Error opting in user:', optInError);
          }
        } else if (permissionNative === 'denied') {
          console.warn('[OneSignal] ⛔ Notifications blocked by user - cannot subscribe');
        }
        
        // Get subscription ID if available
        try {
          const subscriptionId = await OneSignal2.User.PushSubscription.id;
          if (subscriptionId) {
            console.log('[OneSignal] 🎯 Subscription ID:', subscriptionId.substring(0, 8) + '...');
          } else {
            console.log('[OneSignal] ⚠️ No subscription ID yet');
          }
        } catch (err) {
          console.log('[OneSignal] ℹ️ Could not get subscription ID:', err);
        }
        
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
