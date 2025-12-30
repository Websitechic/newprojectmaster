
/**
 * Helper functions for OneSignal in Median apps
 */

export function isMedianApp(): boolean {
  return /median/i.test(navigator.userAgent) || 
         (window as any).median !== undefined ||
         (window as any).webkit?.messageHandlers !== undefined;
}

export function setMedianExternalUserId(userId: string | number): void {
  if (!isMedianApp()) {
    console.warn('[Median] Not running in Median app');
    return;
  }

  console.log('[Median] Setting external user ID:', userId);

  // Try different Median OneSignal interfaces
  try {
    // Modern Median API
    if ((window as any).median?.oneSignal?.setExternalUserId) {
      (window as any).median.oneSignal.setExternalUserId(userId.toString());
      console.log('[Median] ✅ External user ID set via median.oneSignal');
      return;
    }

    // Legacy Median API
    if ((window as any).median?.run) {
      (window as any).median.run('onesignal', {
        action: 'setExternalUserId',
        externalUserId: userId.toString()
      });
      console.log('[Median] ✅ External user ID set via median.run');
      return;
    }

    // iOS WebKit handler
    if ((window as any).webkit?.messageHandlers?.median) {
      (window as any).webkit.messageHandlers.median.postMessage({
        type: 'onesignal',
        action: 'setExternalUserId',
        externalUserId: userId.toString()
      });
      console.log('[Median] ✅ External user ID set via webkit handler');
      return;
    }

    console.error('[Median] ❌ No Median OneSignal interface found');
  } catch (error) {
    console.error('[Median] ❌ Error setting external user ID:', error);
  }
}

export function requestMedianPushPermission(): void {
  if (!isMedianApp()) {
    console.warn('[Median] Not running in Median app');
    return;
  }

  try {
    if ((window as any).median?.oneSignal?.promptForPushNotifications) {
      (window as any).median.oneSignal.promptForPushNotifications();
      console.log('[Median] ✅ Requested push permission');
    }
  } catch (error) {
    console.error('[Median] ❌ Error requesting push permission:', error);
  }
}

declare global {
  interface Window {
    median?: {
      oneSignal?: {
        setExternalUserId?: (id: string) => void;
        promptForPushNotifications?: () => void;
      };
      run?: (service: string, params: any) => void;
    };
    webkit?: {
      messageHandlers?: {
        median?: {
          postMessage: (message: any) => void;
        };
      };
    };
  }
}
