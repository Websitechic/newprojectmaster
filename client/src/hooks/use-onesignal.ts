import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: any) => void>;
    OneSignal?: any;
  }
}

export function useOneSignal(userId?: number) {
  const hasSubscribed = useRef(false);

  useEffect(() => {
    if (!userId) {
      console.log('[OneSignal] ⏸️ Waiting for user ID');
      return;
    }

    const setupOneSignal = async () => {
      try {
        console.log('[OneSignal] 🚀 Setting up for user:', userId);

        // Wait for OneSignal to be ready
        if (!window.OneSignal) {
          console.log('[OneSignal] ⏳ Waiting for SDK to load...');
          await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
              if (window.OneSignal) {
                clearInterval(checkInterval);
                resolve(true);
              }
            }, 100);
          });
        }

        const OneSignal = window.OneSignal;
        console.log('[OneSignal] ✅ SDK loaded');

        // Login user
        console.log('[OneSignal] 👤 Logging in user:', userId);
        await OneSignal.login(userId.toString());
        console.log('[OneSignal] ✅ User logged in');

        // Check if already subscribed
        if (hasSubscribed.current) {
          console.log('[OneSignal] ✓ Already processed in this session');
          return;
        }

        // Check permission status
        const permission = await OneSignal.Notifications.permissionNative;
        console.log('[OneSignal] 🔔 Permission status:', permission);

        if (permission === 'default') {
          console.log('[OneSignal] 📱 Requesting permission...');
          const accepted = await OneSignal.Slidedown.promptPush();
          console.log('[OneSignal] 📊 Prompt result:', accepted);

          // Wait a moment for permission to be processed
          await new Promise(resolve => setTimeout(resolve, 1000));

          const newPermission = await OneSignal.Notifications.permissionNative;
          console.log('[OneSignal] 🔐 New permission:', newPermission);

          if (newPermission === 'granted') {
            hasSubscribed.current = true;
          }
        } else if (permission === 'granted') {
          console.log('[OneSignal] ✅ Permission already granted');

          // Check if opted in
          const optedIn = await OneSignal.User.PushSubscription.optedIn;
          console.log('[OneSignal] 📊 Opted in status:', optedIn);

          if (!optedIn) {
            console.log('[OneSignal] 🔄 Opting in...');
            await OneSignal.User.PushSubscription.optIn();
            console.log('[OneSignal] ✅ Opted in successfully');
          }

          hasSubscribed.current = true;
        } else if (permission === 'denied') {
          console.log('[OneSignal] ❌ Permission denied by user');
        }

        // Log subscription status
        try {
          const subscriptionId = await OneSignal.User.PushSubscription.id;
          const token = await OneSignal.User.PushSubscription.token;
          console.log('[OneSignal] 🎯 Subscription ID:', subscriptionId ? subscriptionId.substring(0, 8) + '...' : 'None');
          console.log('[OneSignal] 🔑 Push Token:', token ? token.substring(0, 8) + '...' : 'None');
        } catch (err) {
          console.log('[OneSignal] ℹ️ No subscription yet');
        }

      } catch (error) {
        console.error('[OneSignal] ❌ Setup error:', error);
      }
    };

    setupOneSignal();

  }, [userId]);
}