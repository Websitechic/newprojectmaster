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
        
        // Don't set isUnlocked yet - wait for successful resume
        // This prevents "Sound Enabled" from showing before user interaction
        if (audioContextRef.current.state === 'suspended') {
          console.log('⏸️ Audio context suspended on restore, waiting for user interaction to resume');
          // Don't set isUnlocked - will be set when user interacts and resume succeeds
        } else if (audioContextRef.current.state === 'running') {
          // Only set unlocked if already running
          if (mounted) {
            setIsUnlocked(true);
          }
        }
      }
    };

    init();

    // Listen for init-audio event (fired from App.tsx or Header)
    const handleInitAudio = async () => {
      await unlockAudioContext();
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
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!audioContextRef.current || !audioBufferRef.current) {
          console.error('🔇 Audio initialization failed');
          return;
        }
      }

      // CRITICAL: Always try to resume on every playback attempt
      // This handles page navigation where context becomes suspended
      if (audioContextRef.current.state !== 'running') {
        console.log('⏸️ Audio context not running (state: ' + audioContextRef.current.state + '), attempting resume...');
        
        try {
          await audioContextRef.current.resume();
          console.log('✅ Audio context resumed, new state:', audioContextRef.current.state);
        } catch (resumeError) {
          console.warn('⚠️ Resume failed, trying silent buffer unlock:', resumeError);
        }

        // If still not running, try silent buffer unlock
        if (audioContextRef.current.state !== 'running' && silentBufferRef.current) {
          try {
            const silentSource = audioContextRef.current.createBufferSource();
            silentSource.buffer = silentBufferRef.current;
            silentSource.connect(audioContextRef.current.destination);
            silentSource.start(0);
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            if (audioContextRef.current.state === 'running') {
              console.log('✅ Audio unlocked via silent buffer');
            }
          } catch (unlockError) {
            console.error('❌ Silent buffer unlock failed:', unlockError);
          }
        }

        // Update state if now running
        if (audioContextRef.current.state === 'running') {
          setIsUnlocked(true);
          sessionStorage.setItem('audioUnlocked', 'true');
          unlockAttemptedRef.current = true;
        } else {
          console.error('❌ Could not resume audio context, state:', audioContextRef.current.state);
          return;
        }
      }

      // Play the notification sound
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.5;

      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      source.onended = () => {
        console.log('✅ Notification sound completed');
      };

      source.start(0);
      console.log('🔊 Notification sound playing');

    } catch (error) {
      console.error('❌ Error playing notification sound:', error);
    }
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized, isUnlocked };
}