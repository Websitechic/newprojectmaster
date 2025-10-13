
import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializationAttemptedRef = useRef(false);
  const MIN_PLAY_INTERVAL = 500; // Minimum 500ms between sounds

  // Initialize audio context
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current || initializationAttemptedRef.current) return;

    initializationAttemptedRef.current = true;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        console.error('AudioContext not supported in this browser');
        return;
      }

      const audioContext = new AudioContext();
      
      // Create a simple beep sound
      const duration = 0.3;
      const sampleRate = audioContext.sampleRate;
      const numSamples = duration * sampleRate;
      const buffer = audioContext.createBuffer(1, numSamples, sampleRate);
      const data = buffer.getChannelData(0);
      
      // Generate a pleasant notification tone (two frequencies)
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-3 * t); // Decay envelope
        data[i] = envelope * (
          Math.sin(2 * Math.PI * 800 * t) * 0.3 + // First tone
          Math.sin(2 * Math.PI * 1000 * t) * 0.3   // Second tone
        );
      }
      
      audioContextRef.current = audioContext;
      audioBufferRef.current = buffer;
      setIsInitialized(true);
      console.log('✓ Audio context initialized successfully');
    } catch (error) {
      console.error('Error initializing audio context:', error);
      initializationAttemptedRef.current = false;
    }
  }, []);

  // Initialize audio context on mount and user interaction
  useEffect(() => {
    const handleUserInteraction = () => {
      if (!audioContextRef.current) {
        console.log('User interaction detected, initializing audio...');
        initAudioContext();
      }
    };

    // Listen for various user interactions - only once per event type
    const events = ['click', 'keydown', 'touchstart', 'mousedown'];
    const handlers: (() => void)[] = [];
    
    events.forEach(event => {
      const handler = () => {
        handleUserInteraction();
        // Remove all handlers after first successful interaction
        handlers.forEach((h, i) => {
          document.removeEventListener(events[i], h);
        });
      };
      handlers.push(handler);
      document.addEventListener(event, handler, { capture: true });
    });

    return () => {
      handlers.forEach((handler, i) => {
        document.removeEventListener(events[i], handler);
      });
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext]);

  const playNotificationSound = useCallback(async () => {
    const now = Date.now();
    
    // Prevent playing sound too frequently
    if (now - lastPlayTimeRef.current < MIN_PLAY_INTERVAL) {
      console.log('⏭️ Notification sound throttled (played', now - lastPlayTimeRef.current, 'ms ago)');
      return;
    }

    // Try to initialize if not done
    if (!audioContextRef.current) {
      console.log('🎵 Audio context not initialized, attempting to initialize...');
      initAudioContext();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    if (!audioContextRef.current || !audioBufferRef.current) {
      console.error('❌ Audio context or buffer not available. User interaction may be required.');
      return;
    }

    try {
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        console.log('▶️ Resuming suspended audio context...');
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.8; // Volume at 80%
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      source.start(0);
      
      lastPlayTimeRef.current = now;
      console.log('✅ Notification sound played successfully at', new Date().toLocaleTimeString());
    } catch (error) {
      console.error('❌ Error playing notification sound:', error);
    }
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized };
}
