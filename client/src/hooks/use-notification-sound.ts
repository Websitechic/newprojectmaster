
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
    console.log('🔊 PLAYING NOTIFICATION SOUND - STARTING');
    
    // Method 1: Create a fresh oscillator immediately (most reliable for SSE)
    try {
      console.log('🔄 Method 1: Creating fresh oscillator');
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.7, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        
        console.log('✅ SOUND PLAYED (Method 1 - Fresh Oscillator)');
        setTimeout(() => ctx.close(), 500);
        return;
      }
    } catch (error) {
      console.warn('⚠️ Method 1 failed:', error);
    }
    
    // Method 2: Try using the initialized audio context
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        console.log('🔄 Initializing audio context...');
        await initAudioContext();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        console.log('▶️ Resuming audio context...');
        await audioContextRef.current.resume();
      }
      
      if (audioContextRef.current && audioBufferRef.current && audioContextRef.current.state === 'running') {
        console.log('✅ Using initialized audio context');
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBufferRef.current;
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = 0.8;
        source.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        source.start(0);
        console.log('✅ SOUND PLAYED (Method 2 - Buffer)');
        return;
      }
    } catch (error) {
      console.warn('⚠️ Method 2 failed:', error);
    }
    
    // Method 3: Simplest fallback - beep with Web Audio API
    try {
      console.log('🔄 Method 3: Simple Web Audio beep');
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.value = 800;
      gain.gain.value = 0.5;
      
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      
      console.log('✅ SOUND PLAYED (Method 3 - Simple beep)');
      setTimeout(() => ctx.close(), 300);
      return;
    } catch (error) {
      console.warn('⚠️ Method 3 failed:', error);
    }
    
    console.error('❌ ALL SOUND PLAYBACK METHODS FAILED');
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized };
}
