import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

const rainAsset = require('@/assets/audio/rain.wav') as number;
const cafeAsset = require('@/assets/audio/cafe.wav') as number;
const windAsset = require('@/assets/audio/wind.wav') as number;

const LOOP_SOURCES = {
  rain: rainAsset,
  cafe: cafeAsset,
  wind: windAsset,
} as const;

type LoopSound = keyof typeof LOOP_SOURCES;
type FocusSound = 'silence' | LoopSound;

function isLoopSound(sound: FocusSound): sound is LoopSound {
  return sound !== 'silence';
}

function quiet(action: () => unknown): void {
  try {
    const result = action();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    // Fast refresh releases the native player before this cleanup runs.
  }
}

export async function enableFocusPlayback(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    // Lock screen controls require exclusive focus. This does not start recording.
    interruptionMode: 'doNotMix',
    allowsRecording: false,
  });
}

export function useFocusLoop(
  sound: FocusSound,
  active: boolean,
): { stoppedByDevice: boolean } {
  const player = useAudioPlayer(null);
  const loadedSound = useRef<LoopSound | null>(null);

  useEffect(() => {
    let cancelled = false;
    const playing = active && isLoopSound(sound);

    async function syncPlayer(): Promise<void> {
      if (playing) {
        try {
          await enableFocusPlayback();
        } catch {
          // The loop can still start if the audio session was already configured.
        }
      }
      if (cancelled) {
        return;
      }
      if (!isLoopSound(sound)) {
        quiet(() => player.pause());
        quiet(() => {
          player.loop = false;
        });
      } else {
        if (loadedSound.current !== sound) {
          quiet(() => player.replace(LOOP_SOURCES[sound]));
          loadedSound.current = sound;
        }
        quiet(() => {
          player.loop = true;
        });
        if (active) {
          quiet(() => player.play());
        } else {
          quiet(() => player.pause());
        }
      }
      if (Platform.OS !== 'android' || typeof player.setActiveForLockScreen !== 'function') {
        return;
      }
      if (playing) {
        quiet(() => player.setActiveForLockScreen(true, { title: 'Focus', artist: 'Organice' }));
      } else {
        quiet(() => player.setActiveForLockScreen(false));
      }
    }

    void syncPlayer();

    return () => {
      cancelled = true;
      quiet(() => player.pause());
      if (Platform.OS === 'android' && typeof player.setActiveForLockScreen === 'function') {
        quiet(() => player.setActiveForLockScreen(false));
      }
    };
  }, [active, player, sound]);

  // Searched node_modules/expo-audio/build/AudioModule.types.d.ts (AudioEvents) and found no headphone or Bluetooth disconnect event.
  return { stoppedByDevice: false };
}
