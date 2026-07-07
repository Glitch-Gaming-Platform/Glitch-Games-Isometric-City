'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { GameAudioEngine, AudioSettings, loadAudioSettings } from './audioEngine';
import { GAME_AUDIO_EVENT, GameAudioCueDetail } from './audioEvents';
import { GameAudioCue } from './soundManifest';

interface AudioContextValue {
  settings: AudioSettings;
  play: (cue: GameAudioCue, gain?: number) => void;
  setEnabled: (enabled: boolean) => void;
  setMasterVolume: (volume: number) => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AudioSettings>(() => loadAudioSettings());
  const [engine] = useState(() => new GameAudioEngine(settings));

  const updateSettings = useCallback((next: Partial<AudioSettings>) => {
    const updated = engine.setSettings(next);
    setSettings(updated);
  }, [engine]);

  const play = useCallback((cue: GameAudioCue, gain?: number) => {
    engine.playCue(cue, gain);
  }, [engine]);

  useEffect(() => {
    const unlock = () => {
      engine.unlock().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [engine]);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<GameAudioCueDetail>).detail;
      if (!detail?.cue) return;
      engine.playCue(detail.cue, detail.gain, detail.allowDuringCooldown);
    };
    window.addEventListener(GAME_AUDIO_EVENT, listener);
    return () => window.removeEventListener(GAME_AUDIO_EVENT, listener);
  }, [engine]);

  const value = useMemo<AudioContextValue>(() => ({
    settings,
    play,
    setEnabled: (enabled) => updateSettings({ enabled }),
    setMasterVolume: (masterVolume) => updateSettings({ masterVolume }),
  }), [play, settings, updateSettings]);

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useGameAudio(): AudioContextValue {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useGameAudio must be used within AudioProvider');
  }
  return context;
}

export function AudioToggleButton({ className = '' }: { className?: string }) {
  const { settings, setEnabled } = useGameAudio();
  const Icon = settings.enabled ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      className={className}
      aria-label={settings.enabled ? 'Mute sound effects' : 'Enable sound effects'}
      title={settings.enabled ? 'Mute sound effects' : 'Enable sound effects'}
      onClick={() => setEnabled(!settings.enabled)}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
