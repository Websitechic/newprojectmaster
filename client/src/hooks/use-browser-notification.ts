import { useEffect, useCallback, useState } from 'react';

export function useBrowserNotification() {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      
      // Request permission if not already granted or denied
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((result) => {
          setPermission(result);
          console.log('📬 Notification permission:', result);
        });
      }
    } else {
      console.warn('⚠️ Browser notifications not supported');
    }
  }, []);

  const showNotification = useCallback(async (title: string, options?: NotificationOptions) => {
    try {
      if (!('Notification' in window)) {
        console.warn('⚠️ Browser notifications not supported');
        return;
      }

      // Request permission if not already requested
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        setPermission(result);
        
        if (result !== 'granted') {
          console.log('📬 Notification permission denied');
          return;
        }
      }

      // Only show notification if permission is granted
      if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'message-notification',
          renotify: true,
          requireInteraction: false,
          ...options,
        });

        // Auto-close notification after 5 seconds
        setTimeout(() => {
          notification.close();
        }, 5000);

        // Focus window when notification is clicked
        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        console.log('📬 Browser notification shown:', title);
      } else {
        console.log('📬 Notification permission not granted:', Notification.permission);
      }
    } catch (error) {
      console.error('❌ Error showing browser notification:', error);
    }
  }, []);

  return { showNotification, permission };
}
