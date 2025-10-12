
import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const MIN_PLAY_INTERVAL = 1000; // Minimum 1 second between sounds

  // Initialize audio context on user interaction
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
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
      console.log('Audio context initialized successfully');
    } catch (error) {
      console.error('Error initializing audio context:', error);
    }
  }, []);

  // Set up click/interaction listener to initialize audio
  useEffect(() => {
    const handleUserInteraction = () => {
      if (!audioContextRef.current) {
        initAudioContext();
      }
    };

    // Listen for any user interaction to initialize audio
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

  const playNotificationSound = useCallback(() => {
    const now = Date.now();
    
    // Prevent playing sound too frequently
    if (now - lastPlayTimeRef.current < MIN_PLAY_INTERVAL) {
      console.log('Notification sound throttled');
      return;
    }

    // Initialize audio context if not already done
    if (!audioContextRef.current) {
      initAudioContext();
    }
    
    if (!audioContextRef.current || !audioBufferRef.current) {
      console.error('Audio context not initialized');
      return;
    }

    try {
      // Resume audio context if suspended (browser autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('Audio context resumed');
        });
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.3; // Set volume to 30%
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      source.start(0);
      
      lastPlayTimeRef.current = now;
      console.log('Notification sound played successfully');
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized };
}
