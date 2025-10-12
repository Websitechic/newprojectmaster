
import { useEffect, useRef, useCallback } from 'react';

export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const MIN_PLAY_INTERVAL = 1000; // Minimum 1 second between sounds

  useEffect(() => {
    // Create audio element with a notification sound
    // Using a data URL for a simple notification beep
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a simple beep sound
    const createBeepSound = () => {
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
      
      return buffer;
    };

    const buffer = createBeepSound();
    
    // Store the audio context and buffer
    audioRef.current = {
      context: audioContext,
      buffer: buffer,
      play: function() {
        const source = this.context.createBufferSource();
        source.buffer = this.buffer;
        const gainNode = this.context.createGain();
        gainNode.gain.value = 0.3; // Set volume to 30%
        source.connect(gainNode);
        gainNode.connect(this.context.destination);
        source.start(0);
      }
    } as any;

    return () => {
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    const now = Date.now();
    
    // Prevent playing sound too frequently
    if (now - lastPlayTimeRef.current < MIN_PLAY_INTERVAL) {
      return;
    }
    
    if (audioRef.current) {
      try {
        (audioRef.current as any).play();
        lastPlayTimeRef.current = now;
      } catch (error) {
        console.error('Error playing notification sound:', error);
      }
    }
  }, []);

  return { playNotificationSound };
}
