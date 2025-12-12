import { useEffect, useRef } from 'react';
import OneSignal from 'react-onesignal';

let isInitialized = false;

export function useOneSignal(userId?: number) {
  const hasLoggedIn = useRef(false);

  useEffect(() => {
    const initializeOneSignal = async () => {
      try {
        const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
        
        if (!appId || appId === 'YOUR_ONESIGNAL_APP_ID') {
          console.log('OneSignal: App ID not configured, skipping initialization');
          return;
        }

        if (!isInitialized) {
          console.log('OneSignal: Initializing with App ID:', appId.substring(0, 8) + '...');
          
          await OneSignal.init({
            appId: appId,
            allowLocalhostAsSecureOrigin: true,
          });
          
          isInitialized = true;
          console.log('OneSignal: Initialized successfully');

          OneSignal.Notifications.addEventListener('permissionChange', (granted: boolean) => {
            console.log('OneSignal: Permission changed to:', granted);
          });

          OneSignal.Notifications.addEventListener('click', (event: any) => {
            console.log('OneSignal: Notification clicked:', event);
          });
        }

        if (userId && !hasLoggedIn.current) {
          console.log('OneSignal: Logging in user:', userId);
          await OneSignal.login(userId.toString());
          hasLoggedIn.current = true;
          console.log('OneSignal: User logged in successfully:', userId);
          
          await OneSignal.Slidedown.promptPush();
          console.log('OneSignal: Permission prompt shown');
        }
      } catch (error) {
        console.error('OneSignal initialization error:', error);
      }
    };

    initializeOneSignal();
  }, [userId]);

  useEffect(() => {
    return () => {
      if (!userId && hasLoggedIn.current) {
        OneSignal.logout().catch(console.error);
        hasLoggedIn.current = false;
        console.log('OneSignal: User logged out');
      }
    };
  }, [userId]);
}
