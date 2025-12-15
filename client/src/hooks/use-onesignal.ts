import { useEffect } from 'react';
import { useUser } from './use-user';

export function useOneSignal() {
  const { user } = useUser();

  useEffect(() => {
    // OneSignal web push is disabled
    // Only mobile push notifications (Android/iOS) are enabled
    // Mobile devices will receive push notifications via the OneSignal REST API
    console.log('[OneSignal] Web push disabled - mobile push only');

    if (user) {
      console.log(`[OneSignal] User ${user.id} will receive push notifications on mobile devices only`);
    }
  }, [user?.id]);
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    OneSignalDeferred?: any[];
  }
}