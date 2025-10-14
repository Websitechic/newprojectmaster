
import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

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
        console.log('Initializing audio context on user interaction...');
        initAudioContext();
      }
    };

    // Try multiple interaction types
    const events = ['click', 'keydown', 'touchstart', 'mousedown'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, capture: true });
    });

    // Also listen for custom init event
    window.addEventListener('init-audio', handleUserInteraction);

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction, { capture: true });
      });
      window.removeEventListener('init-audio', handleUserInteraction);
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext]);

  const playNotificationSound = useCallback(async () => {
    try {
      // Initialize if needed
      if (!audioContextRef.current) {
        initAudioContext();
        // Give a moment for initialization
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      if (!audioContextRef.current || !audioBufferRef.current) {
        console.warn('Audio not ready - initializing on next interaction');
        return;
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        console.log('Resuming suspended audio context...');
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.8;
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      source.start(0);
      
      console.log('🔔 Notification sound played successfully');
    } catch (error) {
      console.error('Error playing notification sound:', error);
      // Try to reinitialize on error
      audioContextRef.current = null;
      audioBufferRef.current = null;
      setIsInitialized(false);
    }
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized };
}
