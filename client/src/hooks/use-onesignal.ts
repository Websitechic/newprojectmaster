
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
          }).catch((error) => {
            console.error('[OneSignal] ❌ Initialization failed:', error);
            if (error.message && error.message.includes('not configured for web push')) {
              console.error('[OneSignal] Please configure web push in your OneSignal dashboard:');
              console.error('[OneSignal] 1. Go to https://dashboard.onesignal.com');
              console.error('[OneSignal] 2. Select your app');
              console.error('[OneSignal] 3. Go to Settings > Platforms > Web Push');
              console.error('[OneSignal] 4. Configure your site URL and enable web push');
            }
            throw error;
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
        
        // Get OneSignal SDK instance
        const OneSignalModule2 = await import('react-onesignal');
        const OneSignal2 = OneSignalModule2.default;
        
        // Login user to OneSignal first
        console.log('[OneSignal] 👤 Logging in user:', userId);
        await OneSignal2.login(userId.toString());
        console.log('[OneSignal] ✅ User logged in successfully');
        
        // Check if push is supported
        const isPushSupported = await OneSignal2.Notifications.isPushSupported();
        console.log('[OneSignal] 📱 Push supported:', isPushSupported);
        
        if (!isPushSupported) {
          console.warn('[OneSignal] ⚠️ Push notifications not supported on this browser');
          return;
        }
        
        // Check current permission state
        const permissionNative = await OneSignal2.Notifications.permissionNative;
        console.log('[OneSignal] 🔐 Native permission:', permissionNative);
        
        // Handle permission states
        if (permissionNative === 'default') {
          // Permission not yet requested - show prompt
          console.log('[OneSignal] 🔔 Requesting notification permission...');
          
          try {
            const didShow = await OneSignal2.Slidedown.promptPush();
            console.log('[OneSignal] 📊 Slidedown shown:', didShow);
            
            // Wait for user interaction
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check permission again after prompt
            const newPermission = await OneSignal2.Notifications.permissionNative;
            console.log('[OneSignal] 🔐 Permission after prompt:', newPermission);
            
            if (newPermission === 'granted') {
              console.log('[OneSignal] ✅ Permission granted by user!');
              // Explicitly opt in after permission granted
              await OneSignal2.User.PushSubscription.optIn();
              console.log('[OneSignal] ✅ User opted in successfully');
              hasSubscribed.current = true;
            } else if (newPermission === 'denied') {
              console.warn('[OneSignal] ❌ Permission denied by user');
            }
          } catch (promptError) {
            console.error('[OneSignal] ❌ Error with permission prompt:', promptError);
          }
        } else if (permissionNative === 'granted') {
          // Permission already granted - ensure subscription is active
          console.log('[OneSignal] ✅ Permission already granted');
          
          try {
            const optedIn = await OneSignal2.User.PushSubscription.optedIn;
            console.log('[OneSignal] 📊 Current opt-in status:', optedIn);
            
            if (!optedIn) {
              console.log('[OneSignal] 🔄 Opting in user...');
              await OneSignal2.User.PushSubscription.optIn();
              console.log('[OneSignal] ✅ User opted in successfully');
            } else {
              console.log('[OneSignal] ✅ User already opted in');
            }
            
            hasSubscribed.current = true;
          } catch (optInError) {
            console.error('[OneSignal] ❌ Error opting in user:', optInError);
          }
        } else if (permissionNative === 'denied') {
          console.warn('[OneSignal] ⛔ Notifications blocked by user - cannot subscribe');
          console.warn('[OneSignal] 💡 User needs to enable notifications in browser settings');
        }
        
        // Log final subscription status
        try {
          const subscriptionId = await OneSignal2.User.PushSubscription.id;
          const token = await OneSignal2.User.PushSubscription.token;
          const optedIn = await OneSignal2.User.PushSubscription.optedIn;
          
          console.log('[OneSignal] 📊 Final Status:');
          console.log('   - Subscription ID:', subscriptionId ? subscriptionId.substring(0, 8) + '...' : 'None');
          console.log('   - Has Token:', !!token);
          console.log('   - Opted In:', optedIn);
        } catch (err) {
          console.log('[OneSignal] ℹ️ Could not get final status:', err);
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
