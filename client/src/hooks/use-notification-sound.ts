import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const silentBufferRef = useRef<AudioBuffer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(() => {
    // Check sessionStorage on initial render
    return sessionStorage.getItem('audioUnlocked') === 'true';
  });
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
    if (!audioContextRef.current || !silentBufferRef.current) {
      console.log('⚠️ Audio context or silent buffer not ready for unlock');
      return;
    }

    try {
      console.log('🔓 Attempting to unlock audio on user interaction, current state:', audioContextRef.current.state);

      // Resume if suspended - ALWAYS try, don't block on unlockAttemptedRef
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('✅ Audio context resumed from suspended state');
      }

      // Play silent buffer to unlock
      const source = audioContextRef.current.createBufferSource();
      source.buffer = silentBufferRef.current;
      source.connect(audioContextRef.current.destination);
      source.start(0);

      setIsUnlocked(true);
      unlockAttemptedRef.current = true;
      sessionStorage.setItem('audioUnlocked', 'true');
      console.log('✅ Audio context unlocked successfully and persisted');
    } catch (error) {
      console.error('❌ Error unlocking audio context:', error);
      // Don't block - allow retries
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      await initAudioContext();
      
      if (!mounted) return;

      // If audio was previously unlocked, mark as attempted
      const wasUnlocked = sessionStorage.getItem('audioUnlocked') === 'true';
      if (wasUnlocked) {
        unlockAttemptedRef.current = true;
        console.log('✅ Audio was previously unlocked');
      }
    };

    init();

    // Listen for init-audio event
    const handleInitAudio = async () => {
      await unlockAudioContext();
    };

    window.addEventListener('init-audio', handleInitAudio);

    return () => {
      mounted = false;
      window.removeEventListener('init-audio', handleInitAudio);
    };
  }, [initAudioContext, unlockAudioContext]);

  // Set up automatic unlock on first user interaction
  useEffect(() => {
    // Skip if already unlocked (including from sessionStorage)
    if (isUnlocked) {
      console.log('⏭️ Auto-unlock skipped - already unlocked');
      return;
    }

    const handleFirstInteraction = () => {
      if (!isUnlocked && audioContextRef.current && silentBufferRef.current) {
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
    try {
      // ALWAYS ensure audio context is initialized
      if (!audioContextRef.current || !audioBufferRef.current) {
        console.log('🔇 Audio context or buffer missing, initializing...');
        await initAudioContext();
      }

      // Check again after initialization attempt
      if (!audioContextRef.current) {
        console.error('🔇 CRITICAL: Audio context still null after initialization - AudioContext may not be supported');
        return;
      }

      if (!audioBufferRef.current) {
        console.error('🔇 CRITICAL: Audio buffer still null after initialization');
        return;
      }

      // ALWAYS try to resume if suspended - retry allows multiple attempts
      const currentState = audioContextRef.current.state;
      console.log('📊 Audio context state before playback:', currentState);
      
      if (currentState === 'suspended') {
        console.log('⏸️ Audio context suspended, attempting resume...');
        try {
          await audioContextRef.current.resume();
          console.log('✅ Audio context successfully resumed');
        } catch (err) {
          console.error('❌ Failed to resume audio context:', err);
          throw err; // Throw so caller knows it failed
        }
      }

      // Play the notification sound
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.7; // Optimal volume - 70%
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      // Start playback
      source.start(0);
      
      console.log('🔊 Notification sound PLAYED SUCCESSFULLY - context state:', audioContextRef.current.state);
      setIsUnlocked(true);
      sessionStorage.setItem('audioUnlocked', 'true');
    } catch (error) {
      console.error('❌ SOUND PLAYBACK FAILED:', error);
      // Re-throw for caller to handle
      throw error;
    }
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized, isUnlocked };
}