
import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializingRef = useRef(false);

  // Initialize audio context
  const initAudioContext = useCallback(async () => {
    if (initializingRef.current || audioContextRef.current?.state === 'running') {
      return;
    }

    initializingRef.current = true;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        console.error('AudioContext not supported in this browser');
        initializingRef.current = false;
        return;
      }

      // Create or reuse context
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }

      // Resume if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Create notification sound buffer
      const duration = 0.3;
      const sampleRate = audioContextRef.current.sampleRate;
      const numSamples = duration * sampleRate;
      const buffer = audioContextRef.current.createBuffer(1, numSamples, sampleRate);
      const data = buffer.getChannelData(0);
      
      // Generate notification tone
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
      console.log('✅ Audio context initialized successfully, state:', audioContextRef.current.state);
    } catch (error) {
      console.error('❌ Error initializing audio context:', error);
    } finally {
      initializingRef.current = false;
    }
  }, []);

  // Initialize on mount and user interaction
  useEffect(() => {
    initAudioContext();
    
    const handleInteraction = () => {
      initAudioContext();
    };

    const events = ['click', 'keydown', 'touchstart', 'mousedown'];
    events.forEach(event => {
      document.addEventListener(event, handleInteraction, { once: true, capture: true });
    });

    window.addEventListener('init-audio', handleInteraction);

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction, { capture: true });
      });
      window.removeEventListener('init-audio', handleInteraction);
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext]);

  const playNotificationSound = useCallback(async () => {
    console.log('🔊 Playing notification sound...');
    
    try {
      // Ensure audio context is ready
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        await initAudioContext();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      if (!audioContextRef.current || !audioBufferRef.current) {
        console.warn('⚠️ Audio context not ready, creating temporary context');
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const tempCtx = new AudioContext();
        
        if (tempCtx.state === 'suspended') {
          await tempCtx.resume();
        }
        
        const osc = tempCtx.createOscillator();
        const gain = tempCtx.createGain();
        
        osc.connect(gain);
        gain.connect(tempCtx.destination);
        
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.6, tempCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, tempCtx.currentTime + 0.3);
        
        osc.start(tempCtx.currentTime);
        osc.stop(tempCtx.currentTime + 0.3);
        
        console.log('✅ Temporary notification sound played');
        setTimeout(() => tempCtx.close(), 500);
        return;
      }

      // Resume if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Play the sound
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.8;
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      source.start(0);
      
      console.log('✅ Notification sound played successfully');
    } catch (error) {
      console.error('❌ Error playing notification sound:', error);
      
      // Emergency fallback
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.6;
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
        
        console.log('✅ Emergency fallback beep played');
        setTimeout(() => ctx.close(), 500);
      } catch (emergencyError) {
        console.error('❌ All sound playback methods failed:', emergencyError);
      }
    }
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized };
}
