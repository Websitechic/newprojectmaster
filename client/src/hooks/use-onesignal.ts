
import { useEffect } from 'react';
import OneSignal from 'react-onesignal';

export function useOneSignal(userId?: number) {
  useEffect(() => {
    const initializeOneSignal = async () => {
      try {
        // Initialize OneSignal - replace with your actual App ID
        await OneSignal.init({
          appId: import.meta.env.VITE_ONESIGNAL_APP_ID || 'YOUR_ONESIGNAL_APP_ID',
          allowLocalhostAsSecureOrigin: true,
        });

        // Set external user ID if user is logged in
        if (userId) {
          await OneSignal.setExternalUserId(userId.toString());
          console.log('OneSignal external user ID set:', userId);
        }

        // Request notification permission
        await OneSignal.showSlidedownPrompt();
      } catch (error) {
        console.error('Error initializing OneSignal:', error);
      }
    };

    initializeOneSignal();
  }, [userId]);
}
