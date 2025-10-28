
import { useEffect, useRef, useCallback, useState } from 'react';

// Global audio context to persist across component unmounts
const getGlobalAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!(window as any).__globalAudioContext) {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContext) {
      (window as any).__globalAudioContext = new AudioContext();
      console.log('🎵 Created global AudioContext');
    }
  }
  return (window as any).__globalAudioContext || null;
};

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(getGlobalAudioContext());
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const silentBufferRef = useRef<AudioBuffer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const initializingRef = useRef(false);
  const unlockAttemptedRef = useRef(false);

  // Create silent buffer for unlocking audio context
  const createSilentBuffer = useCallback((context: AudioContext) => {
    const bufferSize = context.sampleRate * 0.1; // 0.1 second of silence
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    // No need to fill with data - buffer is already silent (zeros)
    return buffer;
  }, []);

  // Create notification sound buffer
  const createNotificationBuffer = useCallback((context: AudioContext) => {
    const duration = 0.3;
    const sampleRate = context.sampleRate;
    const numSamples = duration * sampleRate;
    const buffer = context.createBuffer(1, numSamples, sampleRate);
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
    
    return buffer;
  }, []);

  // Initialize audio context
  const initAudioContext = useCallback(async () => {
    if (initializingRef.current) {
      return;
    }

    initializingRef.current = true;

    try {
      // Use global audio context
      audioContextRef.current = getGlobalAudioContext();
      
      if (!audioContextRef.current) {
        console.warn('⚠️ AudioContext not supported');
        initializingRef.current = false;
        return;
      }

      // Create buffers
      silentBufferRef.current = createSilentBuffer(audioContextRef.current);
      audioBufferRef.current = createNotificationBuffer(audioContextRef.current);
      
      setIsInitialized(true);
      console.log('✅ Audio buffers created, state:', audioContextRef.current.state);
    } catch (error) {
      console.error('❌ Audio initialization error:', error);
      setIsInitialized(false);
    } finally {
      initializingRef.current = false;
    }
  }, [createSilentBuffer, createNotificationBuffer]);

  // Unlock audio context with silent buffer
  const unlockAudioContext = useCallback(async () => {
    try {
      console.log('🔓 Attempting to unlock audio on user interaction');
      
      if (!audioContextRef.current) {
        console.error('❌ No audio context available');
        return false;
      }

      if (!silentBufferRef.current) {
        console.error('❌ No silent buffer available');
        return false;
      }
      
      // Resume if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('✅ Audio context resumed from suspended state');
      }

      // Play silent buffer to unlock
      const source = audioContextRef.current.createBufferSource();
      source.buffer = silentBufferRef.current;
      source.connect(audioContextRef.current.destination);
      source.start(0);
      
      unlockAttemptedRef.current = true;
      setIsUnlocked(true);
      sessionStorage.setItem('audioUnlocked', 'true');
      console.log('✅ Audio context unlocked successfully and persisted');
      return true;
    } catch (error) {
      console.error('❌ Error unlocking audio context:', error);
      return false;
    }
  }, []);

  // Initialize on mount and restore unlock state from sessionStorage
  useEffect(() => {
    // Initialize audio context first
    initAudioContext();

    // Check if audio was previously unlocked
    const wasUnlocked = sessionStorage.getItem('audioUnlocked') === 'true';
    if (wasUnlocked) {
      console.log('✅ Restoring audio unlock state from previous session');
      setIsUnlocked(true);
      unlockAttemptedRef.current = true;
    }

    // Listen for init-audio event (fired from App.tsx or Header)
    const handleInitAudio = async () => {
      console.log('🎵 Manual audio init event received');
      
      // Initialize if needed
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        await initAudioContext();
        // Wait for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Always try to unlock when event is fired
      if (audioContextRef.current && silentBufferRef.current) {
        await unlockAudioContext();
      }
    };

    window.addEventListener('init-audio', handleInitAudio);

    return () => {
      window.removeEventListener('init-audio', handleInitAudio);
      // DON'T close audio context on unmount - keep it alive across pages
    };
  }, [initAudioContext, unlockAudioContext]);

  // Set up automatic unlock on first user interaction (only if not already unlocked)
  useEffect(() => {
    if (isUnlocked) {
      return;
    }

    const handleFirstInteraction = () => {
      if (!isUnlocked && audioContextRef.current && silentBufferRef.current) {
        console.log('🔓 Auto-unlocking on first interaction');
        unlockAudioContext();
      }
    };

    // Listen for various user interaction events
    const events = ['click', 'touchstart', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, handleFirstInteraction, { once: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleFirstInteraction);
      });
    };
  }, [isUnlocked, unlockAudioContext]);

  const playNotificationSound = useCallback(async () => {
    console.log('🔊 playNotificationSound called', {
      hasAudioContext: !!audioContextRef.current,
      hasBuffer: !!audioBufferRef.current,
      isInitialized,
      isUnlocked,
      contextState: audioContextRef.current?.state
    });

    try {
      // Check if audio is unlocked
      if (!isUnlocked) {
        console.warn('⚠️ Audio not unlocked yet - sound will not play');
        return;
      }

      // Initialize if needed
      if (!audioContextRef.current || !audioBufferRef.current) {
        console.error('🔇 Audio not initialized');
        return;
      }

      // Resume if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Create source node and connect to destination
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      
      // Create gain node for volume control
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.5; // Set volume to 50%
      
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      // Start playback
      source.start(0);
      
      console.log('🔊 Notification sound started successfully');
    } catch (error) {
      console.error('❌ Error playing notification sound:', error);
    }
  }, [isUnlocked, isInitialized]);

  return { playNotificationSound, isInitialized, isUnlocked };
}
