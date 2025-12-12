import { useEffect } from 'react';

let isInitialized = false;

export function useOneSignal(userId?: number) {
  useEffect(() => {
    const appId = (import.meta.env.VITE_ONESIGNAL_APP_ID as string) || '';
    
    console.log('[OneSignal] Hook triggered, userId:', userId, 'appId:', appId ? appId.substring(0, 8) + '...' : 'NOT SET');
    
    if (!appId || appId === 'YOUR_ONESIGNAL_APP_ID') {
      console.log('[OneSignal] App ID not configured');
      return;
    }

    const loadAndInitOneSignal = async () => {
      try {
        if (!isInitialized) {
          console.log('[OneSignal] Loading SDK...');
          
          const OneSignalModule = await import('react-onesignal');
          const OneSignal = OneSignalModule.default;
          
          console.log('[OneSignal] Initializing with appId:', appId.substring(0, 8) + '...');
          
          await OneSignal.init({
            appId: appId,
            allowLocalhostAsSecureOrigin: true,
          });
          
          isInitialized = true;
          console.log('[OneSignal] Initialized successfully!');
        }
        
        if (userId) {
          console.log('[OneSignal] Setting user ID:', userId);
          
          const OneSignalModule = await import('react-onesignal');
          const OneSignal = OneSignalModule.default;
          
          try {
            await OneSignal.login(userId.toString());
            console.log('[OneSignal] User logged in:', userId);
          } catch (loginErr) {
            console.error('[OneSignal] Login error:', loginErr);
          }
          
          try {
            console.log('[OneSignal] Prompting for push permission...');
            await OneSignal.Slidedown.promptPush();
            console.log('[OneSignal] Push prompt shown');
          } catch (promptErr) {
            console.log('[OneSignal] Push prompt not shown (may already be granted or blocked):', promptErr);
          }
        }
      } catch (error) {
        console.error('[OneSignal] Error:', error);
      }
    };

    loadAndInitOneSignal();
  }, [userId]);
}
