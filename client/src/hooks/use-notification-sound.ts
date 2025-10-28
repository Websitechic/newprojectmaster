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
    if (unlockAttemptedRef.current || !audioContextRef.current || !silentBufferRef.current) {
      return;
    }

    unlockAttemptedRef.current = true;

    try {
      console.log('🔓 Attempting to unlock audio on user interaction');

      // Resume if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Play silent buffer to unlock
      const source = audioContextRef.current.createBufferSource();
      source.buffer = silentBufferRef.current;
      source.connect(audioContextRef.current.destination);
      source.start(0);

      setIsUnlocked(true);
      sessionStorage.setItem('audioUnlocked', 'true');
      console.log('✅ Audio context unlocked successfully and persisted');
    } catch (error) {
      console.error('❌ Error unlocking audio context:', error);
      unlockAttemptedRef.current = false; // Allow retry
    }
  }, []);

  // Initialize on mount and restore unlock state from sessionStorage
  useEffect(() => {
    let mounted = true;
    
    // Initialize audio context first
    const init = async () => {
      await initAudioContext();

      if (!mounted) return;

      // Check if audio was previously unlocked AFTER initialization
      const wasUnlocked = sessionStorage.getItem('audioUnlocked') === 'true';
      if (wasUnlocked && audioContextRef.current) {
        console.log('✅ Restoring audio unlock state from previous session');
        unlockAttemptedRef.current = true;

        // Ensure context is running
        if (audioContextRef.current.state === 'suspended') {
          try {
            await audioContextRef.current.resume();
            console.log('✅ Audio context resumed on restore');
            if (mounted) {
              setIsUnlocked(true);
            }
          } catch (err) {
            console.error('Error resuming audio context:', err);
            // If resume fails, audio is not truly unlocked
            sessionStorage.removeItem('audioUnlocked');
            unlockAttemptedRef.current = false;
            if (mounted) {
              setIsUnlocked(false);
            }
          }
        } else {
          if (mounted) {
            setIsUnlocked(true);
          }
        }
      }
    };

    init();

    // Listen for init-audio event (fired from App.tsx or Header)
    const handleInitAudio = async () => {
    };

    window.addEventListener('init-audio', handleInitAudio);

    return () => {
      mounted = false;
      window.removeEventListener('init-audio', handleInitAudio);
      // Don't close audio context on unmount - keep it alive for page navigation
      // Only close when user logs out (handled in Header component)
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
    console.log('🔊 playNotificationSound called', {
      hasAudioContext: !!audioContextRef.current,
      hasBuffer: !!audioBufferRef.current,
      isInitialized,
      isUnlocked,
      contextState: audioContextRef.current?.state,
      sessionUnlocked: sessionStorage.getItem('audioUnlocked')
    });

    try {
      // Initialize if needed
      if (!audioContextRef.current || !audioBufferRef.current) {
        console.log('🔇 Audio not initialized yet, initializing now...');
        await initAudioContext();

        // Wait for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 150));

        if (!audioContextRef.current || !audioBufferRef.current) {
          console.error('🔇 Audio initialization failed - no context or buffer');
          return;
        }
      }

      // CRITICAL: Always try to resume audio context to handle page navigation
      if (audioContextRef.current.state === 'suspended') {
        console.log('⏸️ Audio context suspended, attempting resume...');
        try {
          await audioContextRef.current.resume();
          console.log('✅ Audio context resumed successfully, state:', audioContextRef.current.state);

          // Update unlock state if resume was successful
          if (audioContextRef.current.state === 'running') {
            setIsUnlocked(true);
            sessionStorage.setItem('audioUnlocked', 'true');
            unlockAttemptedRef.current = true;
          }
        } catch (resumeError) {
          console.error('❌ Failed to resume audio context:', resumeError);
          console.warn('⚠️ Audio may not play - user interaction required');

          // Try to unlock via silent buffer
          if (silentBufferRef.current) {
            try {
              const silentSource = audioContextRef.current.createBufferSource();
              silentSource.buffer = silentBufferRef.current;
              silentSource.connect(audioContextRef.current.destination);
              silentSource.start(0);
              await new Promise(resolve => setTimeout(resolve, 50));
              
              if (audioContextRef.current.state === 'running') {
                console.log('✅ Audio unlocked via silent buffer after navigation');
                setIsUnlocked(true);
                sessionStorage.setItem('audioUnlocked', 'true');
              } else {
                console.error('❌ Audio context still not running after unlock attempt');
                return;
              }
            } catch (unlockError) {
              console.error('❌ Silent buffer unlock failed:', unlockError);
              return;
            }
          } else {
            return;
          }
        }
      } else if (audioContextRef.current.state === 'running') {
        // Even if running, ensure unlock state is set
        if (!isUnlocked) {
          console.log('✅ Audio context running, updating unlock state');
          setIsUnlocked(true);
          sessionStorage.setItem('audioUnlocked', 'true');
          unlockAttemptedRef.current = true;
        }
      }

      // Ensure context is in running state before attempting playback
      if (audioContextRef.current.state !== 'running') {
        console.error('❌ Audio context not in running state:', audioContextRef.current.state);
        console.warn('⚠️ Attempting unlock via silent buffer...');

        // Try playing silent buffer to unlock
        if (silentBufferRef.current) {
          try {
            const silentSource = audioContextRef.current.createBufferSource();
            silentSource.buffer = silentBufferRef.current;
            silentSource.connect(audioContextRef.current.destination);
            silentSource.start(0);

            // Wait for unlock
            await new Promise(resolve => setTimeout(resolve, 100));

            if (audioContextRef.current.state === 'running') {
              console.log('✅ Audio unlocked via silent buffer');
              setIsUnlocked(true);
              sessionStorage.setItem('audioUnlocked', 'true');
            } else {
              console.error('❌ Silent buffer unlock failed, state:', audioContextRef.current.state);
              return;
            }
          } catch (unlockError) {
            console.error('❌ Silent buffer unlock error:', unlockError);
            return;
          }
        } else {
          console.error('❌ No silent buffer available for unlock');
          return;
        }
      }

      // Final check before playback
      if (!audioBufferRef.current) {
        console.error('❌ Audio buffer missing');
        return;
      }

      // Create and play notification sound
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.5;

      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      source.onended = () => {
        console.log('✅ Notification sound playback completed');
      };

      source.start(0);

      console.log('🔊 Notification sound playing', {
        contextState: audioContextRef.current.state,
        bufferDuration: audioBufferRef.current.duration,
        currentTime: audioContextRef.current.currentTime
      });
    } catch (error) {
      console.error('❌ Error playing notification sound:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        contextState: audioContextRef.current?.state,
        hasBuffer: !!audioBufferRef.current
      });
    }
  }, [initAudioContext, isInitialized, isUnlocked]);

  return { playNotificationSound, isInitialized, isUnlocked };
}