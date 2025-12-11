
import { useEffect } from 'react';
import OneSignal from 'react-onesignal';

export function useOneSignal(userId?: number) {
  useEffect(() => {
    // Only initialize if user is authenticated
    if (!userId) {
      console.log('OneSignal: Waiting for user authentication');
      return;
    }

    const initializeOneSignal = async () => {
      try {
        // Check if OneSignal credentials are configured
        const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
        if (!appId || appId === 'YOUR_ONESIGNAL_APP_ID') {
          console.log('OneSignal: App ID not configured, skipping initialization');
          return;
        }

        // Initialize OneSignal
        await (OneSignal as any).init({
          appId: appId,
          allowLocalhostAsSecureOrigin: true,
        });

        // Set external user ID
        await (OneSignal as any).User.PushSubscription.optIn();
        await (OneSignal as any).login(userId.toString());
        console.log('OneSignal external user ID set:', userId);

        // Request notification permission
        const permission = await (OneSignal as any).Notifications.requestPermission(true);
        console.log('OneSignal notification permission:', permission);
      } catch (error) {
        console.error('Error initializing OneSignal:', error);
      }
    };

    initializeOneSignal();
  }, [userId]);
}
