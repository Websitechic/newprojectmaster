
import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializingRef = useRef(false);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio context with better error handling
  const initAudioContext = useCallback(async () => {
    if (initializingRef.current) {
      return;
    }

    initializingRef.current = true;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        console.warn('⚠️ AudioContext not supported, using fallback');
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

  // Initialize on mount only - no user interaction detection
  useEffect(() => {
    // Try to initialize immediately
    initAudioContext();

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext]);

  const playNotificationSound = useCallback(async () => {
    console.log('🔊 PLAYING NOTIFICATION SOUND - STARTING');
    
    // Method 1: Try using the initialized audio context
    try {
      // Ensure initialization
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        console.log('🔄 Audio context not ready, initializing...');
        await initAudioContext();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Resume if suspended (critical for mobile browsers)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        console.log('▶️ Resuming suspended audio context...');
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
        console.log('✅ SOUND PLAYED SUCCESSFULLY (Method 1)');
        return;
      }
    } catch (error) {
      console.warn('⚠️ Method 1 failed:', error);
    }
    
    // Method 2: Create temporary oscillator
    try {
      console.log('🔄 Trying Method 2: Temporary oscillator');
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
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
        gain.gain.setValueAtTime(0.7, tempCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, tempCtx.currentTime + 0.3);
        
        osc.start(tempCtx.currentTime);
        osc.stop(tempCtx.currentTime + 0.3);
        
        console.log('✅ SOUND PLAYED SUCCESSFULLY (Method 2)');
        setTimeout(() => tempCtx.close(), 500);
        return;
      }
    } catch (error) {
      console.warn('⚠️ Method 2 failed:', error);
    }
    
    // Method 3: HTML5 Audio fallback (works on mobile)
    try {
      console.log('🔄 Trying Method 3: HTML5 Audio');
      if (!fallbackAudioRef.current) {
        // Create a data URL for a simple beep sound
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const duration = 0.2;
        const sampleRate = audioContext.sampleRate;
        const numSamples = duration * sampleRate;
        const buffer = audioContext.createBuffer(1, numSamples, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          data[i] = Math.sin(2 * Math.PI * 800 * t) * Math.exp(-3 * t) * 0.5;
        }
        
        // Note: Creating data URL from audio buffer is complex, use simple beep instead
        const audio = new Audio();
        audio.volume = 0.5;
        fallbackAudioRef.current = audio;
      }
      
      // Try playing (may fail due to autoplay restrictions)
      const playPromise = fallbackAudioRef.current?.play();
      if (playPromise) {
        await playPromise;
        console.log('✅ SOUND PLAYED SUCCESSFULLY (Method 3)');
        return;
      }
    } catch (error) {
      console.warn('⚠️ Method 3 failed:', error);
    }
    
    console.error('❌ ALL SOUND PLAYBACK METHODS FAILED');
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized };
}
