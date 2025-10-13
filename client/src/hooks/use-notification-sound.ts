
import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const MIN_PLAY_INTERVAL = 500; // Minimum 500ms between sounds

  // Initialize audio context immediately on mount
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

  // Initialize on first user interaction
  useEffect(() => {
    const handleUserInteraction = () => {
      if (!audioContextRef.current) {
        initAudioContext();
        // Remove listeners after initialization
        document.removeEventListener('click', handleUserInteraction);
        document.removeEventListener('keydown', handleUserInteraction);
      }
    };

    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext]);

  const playNotificationSound = useCallback(async () => {
    const now = Date.now();
    
    // Prevent playing sound too frequently
    if (now - lastPlayTimeRef.current < MIN_PLAY_INTERVAL) {
      return;
    }

    // Initialize if needed
    if (!audioContextRef.current) {
      initAudioContext();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!audioContextRef.current || !audioBufferRef.current) {
      console.warn('Audio not ready - user interaction required');
      return;
    }

    try {
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.8;
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      source.start(0);
      
      lastPlayTimeRef.current = now;
      console.log('🔔 Notification sound played');
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized };
}
