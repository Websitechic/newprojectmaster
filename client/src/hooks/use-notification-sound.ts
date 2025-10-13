
import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const MIN_PLAY_INTERVAL = 1000; // Minimum 1 second between sounds

  // Initialize audio context
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return;

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
    }
  }, []);

  // Initialize audio context on mount and user interaction
  useEffect(() => {
    const handleUserInteraction = () => {
      if (!audioContextRef.current) {
        console.log('User interaction detected, initializing audio silently...');
        initAudioContext();
        // Don't play sound during initialization
      }
    };

    // Listen for various user interactions
    const events = ['click', 'keydown', 'touchstart', 'mousedown'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, capture: true });
    });

    // Try to initialize early (will fail on some browsers until user interaction)
    initAudioContext();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext]);

  const playNotificationSound = useCallback(async () => {
    const now = Date.now();
    
    console.log('🔊 playNotificationSound called', {
      hasContext: !!audioContextRef.current,
      hasBuffer: !!audioBufferRef.current,
      isInitialized,
      contextState: audioContextRef.current?.state,
      timeSinceLastPlay: now - lastPlayTimeRef.current
    });
    
    // Prevent playing sound too frequently
    if (now - lastPlayTimeRef.current < MIN_PLAY_INTERVAL) {
      console.log('⏭️ Notification sound throttled');
      return;
    }

    // Try to initialize if not done
    if (!audioContextRef.current) {
      console.log('🎵 Audio context not initialized, attempting to initialize...');
      initAudioContext();
      
      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!audioContextRef.current || !audioBufferRef.current) {
      console.error('❌ Audio context or buffer still not available after initialization attempt');
      return;
    }

    try {
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        console.log('▶️ Resuming suspended audio context...');
        await audioContextRef.current.resume();
        console.log('✓ Audio context resumed, state:', audioContextRef.current.state);
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.6; // Volume at 60%
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      source.start(0);
      
      lastPlayTimeRef.current = now;
      console.log('✅ Notification sound played successfully at', new Date().toISOString());
    } catch (error) {
      console.error('❌ Error playing notification sound:', error);
    }
  }, [initAudioContext, isInitialized]);

  return { playNotificationSound, isInitialized };
}
