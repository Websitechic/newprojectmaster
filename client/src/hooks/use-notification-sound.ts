
import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
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
      console.log('✅ Audio context unlocked successfully');
    } catch (error) {
      console.error('❌ Error unlocking audio context:', error);
      unlockAttemptedRef.current = false; // Allow retry
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

  // No automatic unlock on user interaction - only unlock when sound needs to play

  const playNotificationSound = useCallback(async () => {
    console.log('🔊 playNotificationSound called', {
      hasAudioContext: !!audioContextRef.current,
      hasBuffer: !!audioBufferRef.current,
      isInitialized,
      isUnlocked,
      contextState: audioContextRef.current?.state
    });

    try {
      // Initialize if needed
      if (!audioContextRef.current || !audioBufferRef.current) {
        console.log('🔇 Audio not initialized yet, trying to initialize...');
        await initAudioContext();
        
        // Wait a bit for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!audioContextRef.current || !audioBufferRef.current) {
          console.error('🔇 Audio initialization failed - no context or buffer');
          return;
        }
      }

      // Auto-unlock audio when trying to play (this happens in response to incoming message)
      // Resume context if suspended
      if (audioContextRef.current.state === 'suspended') {
        console.log('🔓 Unlocking and resuming audio context for message notification...');
        try {
          await audioContextRef.current.resume();
          console.log('✅ Audio context resumed, state:', audioContextRef.current.state);
          
          // Play silent buffer once to unlock if needed
          if (!isUnlocked) {
            const silentSource = audioContextRef.current.createBufferSource();
            silentSource.buffer = silentBufferRef.current;
            silentSource.connect(audioContextRef.current.destination);
            silentSource.start(0);
            setIsUnlocked(true);
            
            // Small delay to ensure unlock completes
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (resumeError) {
          console.error('❌ Failed to resume audio context:', resumeError);
          return;
        }
      }

      // Double-check we have everything we need
      if (!audioBufferRef.current) {
        console.error('❌ Audio buffer missing after initialization');
        return;
      }

      // Create source node and connect to destination
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(audioContextRef.current.destination);
      
      // Add error handler for the source
      source.onended = () => {
        console.log('✅ Notification sound playback completed');
      };
      
      source.start(0);
      
      console.log('🔊 Notification sound started successfully', {
        contextState: audioContextRef.current.state,
        bufferDuration: audioBufferRef.current.duration
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
  }, [initAudioContext, isUnlocked, isInitialized]);

  return { playNotificationSound, isInitialized, isUnlocked };
}
