import { useEffect, useRef, useCallback, useState } from 'react';

export function useNotificationSound() {
  console.log('🎵 useNotificationSound hook called');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const silentBufferRef = useRef<AudioBuffer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return typeof window !== 'undefined' && sessionStorage.getItem('audioUnlocked') === 'true';
  });

  // Initialize audio context - called once on mount
  useEffect(() => {
    console.log('🎬 useNotificationSound useEffect running - MOUNT');
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      if (!AudioContextClass) {
        console.error('❌ AudioContext not supported in this browser');
        return;
      }

      console.log('📦 AudioContext class found, creating context...');

      // Create context
      audioContextRef.current = new AudioContextClass();
      console.log('🎵 Created new AudioContext, state:', audioContextRef.current.state);

      // Create silent buffer for unlocking
      const silentBufferSize = Math.floor(audioContextRef.current.sampleRate * 0.1);
      silentBufferRef.current = audioContextRef.current.createBuffer(1, silentBufferSize, audioContextRef.current.sampleRate);
      console.log('🔇 Created silent buffer');

      // Create notification sound buffer - simple beep
      const duration = 0.3;
      const sampleRate = audioContextRef.current.sampleRate;
      const numSamples = Math.floor(duration * sampleRate);
      const buffer = audioContextRef.current.createBuffer(1, numSamples, sampleRate);
      const data = buffer.getChannelData(0);

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
      console.log('✅ Audio context and buffers created successfully!', {
        state: audioContextRef.current.state,
        sampleRate: audioContextRef.current.sampleRate
      });

    } catch (error) {
      console.error('❌ Audio initialization error:', error);
    }

    return () => {
      console.log('🛑 useNotificationSound cleanup');
    };
  }, []); // Empty dependency array - run once on mount

  // Unlock audio context on user interaction
  const unlockAudioContext = useCallback(async () => {
    console.log('🔓 unlockAudioContext called');
    
    if (!audioContextRef.current || !silentBufferRef.current) {
      console.error('❌ Audio not initialized yet');
      return;
    }

    try {
      console.log('🔊 Audio context state before unlock:', audioContextRef.current.state);

      // Resume if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('✅ Audio context resumed, new state:', audioContextRef.current.state);
      }

      // Play silent buffer to fully unlock
      const source = audioContextRef.current.createBufferSource();
      source.buffer = silentBufferRef.current;
      source.connect(audioContextRef.current.destination);
      source.start(0);

      setIsUnlocked(true);
      sessionStorage.setItem('audioUnlocked', 'true');
      console.log('✅ Audio context unlocked successfully');
    } catch (error) {
      console.error('❌ Error unlocking audio context:', error);
    }
  }, []);

  // Set up automatic unlock on first user interaction
  useEffect(() => {
    if (isUnlocked) {
      console.log('⏭️ Auto-unlock skipped - already unlocked');
      return;
    }

    const handleFirstInteraction = () => {
      console.log('👆 User interaction detected, unlocking audio...');
      unlockAudioContext();
    };

    const events = ['click', 'touchstart', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, handleFirstInteraction, { once: true, passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleFirstInteraction);
      });
    };
  }, [isUnlocked, unlockAudioContext]);

  // Play notification sound
  const playNotificationSound = useCallback(async () => {
    console.log('🔔 playNotificationSound called');
    
    try {
      if (!audioContextRef.current || !audioBufferRef.current) {
        console.error('❌ Audio not ready - context:', !!audioContextRef.current, 'buffer:', !!audioBufferRef.current);
        return;
      }

      const context = audioContextRef.current;
      const buffer = audioBufferRef.current;

      console.log('📊 Audio context state:', context.state);

      // Resume if suspended
      if (context.state === 'suspended') {
        console.log('⏸️ Audio suspended, resuming...');
        try {
          await context.resume();
          console.log('✅ Audio resumed, new state:', context.state);
        } catch (resumeError) {
          console.error('❌ Failed to resume audio context:', resumeError);
          return;
        }
      }

      // Create and play the sound
      console.log('🎵 Creating audio source...');
      const source = context.createBufferSource();
      source.buffer = buffer;

      // Add gain node for volume control
      const gainNode = context.createGain();
      gainNode.gain.value = 0.7;

      source.connect(gainNode);
      gainNode.connect(context.destination);

      source.onended = () => {
        console.log('✅ Sound playback completed');
      };

      source.start(0);
      console.log('🔊 NOTIFICATION SOUND PLAYING NOW!');

    } catch (error) {
      console.error('❌ Error playing notification sound:', error);
    }
  }, []);

  // Play alarm sound - loud and continuous
  const playAlarmSound = useCallback(async () => {
    console.log('🚨 playAlarmSound called');
    
    try {
      if (!audioContextRef.current) {
        console.error('❌ Audio not ready');
        return;
      }

      const context = audioContextRef.current;
      
      // Resume if suspended
      if (context.state === 'suspended') {
        await context.resume();
      }

      const osc1 = context.createOscillator();
      const osc2 = context.createOscillator();
      const gainNode = context.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      
      osc1.frequency.setValueAtTime(440, context.currentTime);
      osc2.frequency.setValueAtTime(445, context.currentTime);

      // Create a siren effect
      osc1.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.5);
      osc1.frequency.exponentialRampToValueAtTime(440, context.currentTime + 1.0);
      
      gainNode.gain.setValueAtTime(0.5, context.currentTime);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(context.destination);

      osc1.start();
      osc2.start();

      // Stop after 5 seconds to not be too annoying but still "continuous" enough
      osc1.stop(context.currentTime + 5);
      osc2.stop(context.currentTime + 5);

      console.log('🔊 ALARM SOUND PLAYING NOW!');
    } catch (error) {
      console.error('❌ Error playing alarm sound:', error);
    }
  }, []);

  return {
    playNotificationSound,
    playAlarmSound,
    unlockAudioContext,
    isUnlocked,
    isInitialized,
  };
}
