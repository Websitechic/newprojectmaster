import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: any) => void>;
    OneSignal?: any;
  }
}

let isInitialized = false;

export function useOneSignal(userId?: number) {
  const hasSubscribed = useRef(false);

  useEffect(() => {
    const appId = (import.meta.env.VITE_ONESIGNAL_APP_ID as string) || '2cadde98-760a-48de-8db1-879f1864713f';

    console.log('[OneSignal] Hook triggered');
    console.log('[OneSignal] User ID:', userId);
    console.log('[OneSignal] App ID:', appId);

    if (!userId) {
      console.log('[OneSignal] ⏸️ Waiting for user ID');
      return;
    }

    const initializeOneSignal = async () => {
      try {
        console.log('[OneSignal] 🚀 Starting initialization...');

        // Wait for OneSignal to be loaded
        await new Promise<void>((resolve) => {
          if (window.OneSignal) {
            resolve();
          } else {
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            window.OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.init({
                appId: appId,
                allowLocalhostAsSecureOrigin: true,
                notifyButton: {
                  enable: false,
                },
              });
              isInitialized = true;
              console.log('[OneSignal] ✅ SDK initialized');
              resolve();
            });
          }
        });

        if (hasSubscribed.current) {
          console.log('[OneSignal] ✓ User already subscribed in this session');
          return;
        }

        const OneSignal = window.OneSignal;

        // Check current permission state
        const permission = await OneSignal.Notifications.permission;
        console.log('[OneSignal] 🔔 Current permission:', permission);

        // Login user to OneSignal
        console.log('[OneSignal] 👤 Logging in user:', userId);
        await OneSignal.login(userId.toString());
        console.log('[OneSignal] ✅ User logged in successfully');

        // Check if push is supported
        const isPushSupported = await OneSignal.Notifications.isPushSupported();
        console.log('[OneSignal] 📱 Push supported:', isPushSupported);

        if (!isPushSupported) {
          console.warn('[OneSignal] ⚠️ Push notifications not supported');
          return;
        }

        const permissionNative = await OneSignal.Notifications.permissionNative;
        console.log('[OneSignal] 🔐 Native permission:', permissionNative);

        // Request permission if needed
        if (permissionNative === 'default') {
          console.log('[OneSignal] 🔔 Requesting permission...');

          try {
            const didShow = await OneSignal.Slidedown.promptPush();
            console.log('[OneSignal] 📊 Slidedown shown:', didShow);

            await new Promise(resolve => setTimeout(resolve, 1000));

            const newPermission = await OneSignal.Notifications.permissionNative;
            console.log('[OneSignal] 🔐 Permission after prompt:', newPermission);

            if (newPermission === 'granted') {
              console.log('[OneSignal] ✅ Permission granted!');
              hasSubscribed.current = true;
            }
          } catch (promptError) {
            console.error('[OneSignal] ❌ Error showing prompt:', promptError);
          }
        } else if (permissionNative === 'granted') {
          console.log('[OneSignal] ✅ Permission already granted');
          hasSubscribed.current = true;

          try {
            const optedIn = await OneSignal.User.PushSubscription.optedIn;
            console.log('[OneSignal] 📊 User opted in:', optedIn);

            if (!optedIn) {
              console.log('[OneSignal] 🔄 Opting in user...');
              await OneSignal.User.PushSubscription.optIn();
              console.log('[OneSignal] ✅ User opted in successfully');
            }
          } catch (optInError) {
            console.error('[OneSignal] ❌ Error opting in:', optInError);
          }
        }

        // Get subscription ID
        try {
          const subscriptionId = await OneSignal.User.PushSubscription.id;
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
      }
    };

    initializeOneSignal();

  }, [userId]);
}