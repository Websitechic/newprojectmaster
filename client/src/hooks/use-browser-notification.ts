import { useEffect, useCallback, useState } from 'react';

interface NotificationData {
  url?: string;
}

// Helper to unlock audio context globally using notification permission
const unlockAudio = async () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    // Get or create global audio context
    if (!(window as any).__audioContext) {
      (window as any).__audioContext = new AudioContext();
    }
    
    const audioContext = (window as any).__audioContext;
    
    // Resume if suspended
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
      console.log('🔊 Audio context unlocked via user interaction');
    }
    
    // Play silent buffer to ensure full unlock (required for some browsers)
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    
    // Mark as unlocked globally
    (window as any).__audioUnlocked = true;
    console.log('✅ Audio fully unlocked and ready');
  } catch (error) {
    console.warn('⚠️ Could not unlock audio:', error);
  }
};

export function useBrowserNotification() {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Request notification permission on mount and unlock audio
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('⚠️ Browser notifications not supported');
      return;
    }
    
    setPermission(Notification.permission);
    
    // If permission already granted, unlock audio
    if (Notification.permission === 'granted') {
      unlockAudio();
    }
    // Request permission if not set
    else if (Notification.permission === 'default') {
      Notification.requestPermission().then(async (result) => {
        setPermission(result);
        console.log('📬 Notification permission:', result);
        
        // Use the permission grant as a user gesture to unlock audio
        if (result === 'granted') {
          await unlockAudio();
        }
      }).catch((error) => {
        console.error('❌ Error requesting notification permission:', error);
      });
    }
  }, []);

  // Also unlock audio on any user interaction (backup)
  useEffect(() => {
    const handleInteraction = () => {
      if (typeof window !== 'undefined' && 'Notification' in window && 
          !(window as any).__audioUnlocked && Notification.permission === 'granted') {
        unlockAudio();
      }
    };

    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  const showNotification = useCallback(async (
    title: string, 
    options?: NotificationOptions & { data?: NotificationData }
  ) => {
    try {
      console.log('📬 showNotification called:', title);
      
      if (typeof window === 'undefined' || !('Notification' in window)) {
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
        
        // Unlock audio on permission grant
        await unlockAudio();
      }

      // Only show notification if permission is granted
      if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'message-notification',
          requireInteraction: false,
          ...options,
        });

        console.log('📬 Notification shown:', title);

        // Auto-close notification after 5 seconds
        setTimeout(() => {
          notification.close();
        }, 5000);

        // Focus window and navigate when notification is clicked
        notification.onclick = () => {
          console.log('📬 Notification clicked');
          window.focus();
          
          // Navigate to the URL if provided
          if (options?.data?.url) {
            window.location.href = options.data.url;
          }
          
          notification.close();
        };
      } else {
        console.log('📬 Notification permission not granted:', Notification.permission);
      }
    } catch (error) {
      console.error('❌ Error showing browser notification:', error);
    }
  }, []);

  return { showNotification, permission };
}
