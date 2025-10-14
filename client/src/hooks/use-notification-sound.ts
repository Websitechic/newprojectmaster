
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
    console.log('🔊 playNotificationSound called, initialized:', isInitialized, 'context:', !!audioContextRef.current);
    
    try {
      // Initialize if needed
      if (!audioContextRef.current) {
        console.log('⚠️ Audio context not initialized, initializing now...');
        initAudioContext();
        // Give a moment for initialization
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!audioContextRef.current || !audioBufferRef.current) {
        console.warn('⚠️ Audio not ready - using fallback beep');
        // Fallback: try to play a simple beep using Web Audio API
        try {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContext();
          
          console.log('🔧 Fallback context state:', ctx.state);
          
          // Resume if needed
          if (ctx.state === 'suspended') {
            await ctx.resume();
            console.log('🔧 Fallback context resumed, new state:', ctx.state);
          }
          
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          
          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.3);
          
          console.log('✅ Fallback beep played successfully');
          
          // Clean up
          setTimeout(() => ctx.close(), 500);
          return;
        } catch (fallbackError) {
          console.error('❌ Fallback beep failed:', fallbackError);
          return;
        }
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        console.log('🔄 Resuming suspended audio context...');
        await audioContextRef.current.resume();
        console.log('✅ Audio context resumed, state:', audioContextRef.current.state);
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.8;
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      source.start(0);
      
      console.log('✅ Notification sound played successfully via main context');
    } catch (error) {
      console.error('❌ Error playing notification sound:', error);
      // Try to reinitialize on error
      audioContextRef.current = null;
      audioBufferRef.current = null;
      setIsInitialized(false);
      
      // Try one more fallback
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.5;
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
        console.log('✅ Emergency fallback beep played');
        setTimeout(() => ctx.close(), 500);
      } catch (emergencyError) {
        console.error('❌ Emergency fallback also failed:', emergencyError);
      }
    }
  }, [initAudioContext, isInitialized]);

  return { playNotificationSound, isInitialized };
}
