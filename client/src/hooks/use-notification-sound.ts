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
      // Initialize if needed
      if (!audioContextRef.current || !audioBufferRef.current) {
        console.log('🔇 Initializing audio...');
        await initAudioContext();
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      if (!audioContextRef.current || !audioBufferRef.current) {
        console.error('🔇 Audio initialization failed');
        return;
      }

      // ALWAYS resume audio context before playing - handles suspension from page navigation
      if (audioContextRef.current.state !== 'running') {
        console.log('⏸️ Resuming audio context from state:', audioContextRef.current.state);
        
        // Try multiple resume strategies
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await audioContextRef.current.resume();
            
            // Wait a bit for state to update
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // If still not running, try playing silent buffer to force unlock
            if (audioContextRef.current.state !== 'running' && silentBufferRef.current) {
              console.log(`🔓 Attempt ${attempt + 1}: Playing silent buffer to unlock`);
              const silent = audioContextRef.current.createBufferSource();
              silent.buffer = silentBufferRef.current;
              silent.connect(audioContextRef.current.destination);
              silent.start(0);
              await new Promise(resolve => setTimeout(resolve, 100));
              await audioContextRef.current.resume();
            }
            
            // Check if we succeeded
            if (audioContextRef.current.state === 'running') {
              console.log('✅ Audio resumed successfully');
              setIsUnlocked(true);
              sessionStorage.setItem('audioUnlocked', 'true');
              unlockAttemptedRef.current = true;
              break;
            }
          } catch (err) {
            console.error(`❌ Resume attempt ${attempt + 1} failed:`, err);
            if (attempt === 2) {
              console.error('❌ All resume attempts failed, audio context state:', audioContextRef.current.state);
              // Don't return - try to play anyway, it might work
            }
          }
        }
      }

      // Play sound even if state is not "running" - sometimes it works anyway
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.6; // Slightly louder
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      source.start(0);
      
      console.log('🔊 Sound playing, context state:', audioContextRef.current.state);
    } catch (error) {
      console.error('❌ Playback error:', error);
      // Try to reinitialize for next time
      initAudioContext().catch(console.error);
    }
  }, [initAudioContext]);

  return { playNotificationSound, isInitialized, isUnlocked };
}