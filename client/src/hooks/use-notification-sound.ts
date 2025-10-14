
import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializingRef = useRef(false);

  // Initialize audio context with better error handling
  const initAudioContext = useCallback(async () => {
    if (initializingRef.current) {
      return;
    }

    initializingRef.current = true;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        console.warn('⚠️ AudioContext not supported');
        initializingRef.current = false;
        return;
      }

      // Create new context if needed
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
        console.log('🎵 Created new AudioContext');
      }

      // Resume if suspended (handles autoplay restrictions)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('▶️ Resumed suspended AudioContext');
      }
      
      // Create notification sound buffer
      const duration = 0.3;
      const sampleRate = audioContextRef.current.sampleRate;
      const numSamples = duration * sampleRate;
      const buffer = audioContextRef.current.createBuffer(1, numSamples, sampleRate);
      const data = buffer.getChannelData(0);
      
      // Generate pleasant notification tone
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-3 * t);
        data[i] = envelope * (
          Math.sin(2 * Math.PI * 800 * t) * 0.3 +
          Math.sin(2 * Math.PI * 1000 * t) * 0.3
        );
      }
      
      audioBufferRef.current = buffer;
      setIsInitialized(true);
      console.log('✅ Audio initialized, state:', audioContextRef.current.state);
    } catch (error) {
      console.error('❌ Audio initialization error:', error);
      setIsInitialized(false);
    } finally {
      initializingRef.current = false;
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initAudioContext();

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext]);

  const playNotificationSound = useCallback(async () => {
    // Sound is disabled - do nothing
    console.log('🔇 Sound playback is disabled');
    return;
  }, []);

  return { playNotificationSound, isInitialized };
}
