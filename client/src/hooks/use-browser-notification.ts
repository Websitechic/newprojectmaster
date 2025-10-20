import { useEffect, useCallback, useState } from 'react';

interface NotificationData {
  url?: string;
}

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
        }).catch((error) => {
          console.error('❌ Error requesting notification permission:', error);
        });
      }
    } else {
      console.warn('⚠️ Browser notifications not supported');
    }
  }, []);

  const showNotification = useCallback(async (
    title: string, 
    options?: NotificationOptions & { data?: NotificationData }
  ) => {
    try {
      console.log('📬 showNotification called with title:', title);
      
      if (!('Notification' in window)) {
        console.warn('⚠️ Browser notifications not supported');
        return;
      }

      console.log('📬 Current notification permission:', Notification.permission);

      // Request permission if not already requested
      if (Notification.permission === 'default') {
        console.log('📬 Requesting notification permission...');
        const result = await Notification.requestPermission();
        setPermission(result);
        
        if (result !== 'granted') {
          console.log('📬 Notification permission denied');
          return;
        }
      }

      // Only show notification if permission is granted
      if (Notification.permission === 'granted') {
        console.log('📬 Creating notification with title:', title, 'options:', options);
        const notification = new Notification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'message-notification',
          requireInteraction: false,
          ...options,
        });

        console.log('✅ Notification created successfully');

        // Auto-close notification after 5 seconds
        setTimeout(() => {
          notification.close();
        }, 5000);

        // Focus window and navigate when notification is clicked
        notification.onclick = (event: Event) => {
          console.log('📬 Notification clicked, focusing window');
          window.focus();
          
          // Navigate to the URL if provided - access from notification.data
          const notificationEvent = event.target as Notification;
          if (notificationEvent?.data?.url) {
            console.log('📬 Navigating to:', notificationEvent.data.url);
            window.location.href = notificationEvent.data.url;
          }
          
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
