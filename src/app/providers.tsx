'use client';

import React from 'react';
import { AudioProvider } from '@/lib/audio/AudioProvider';
import { GlitchAccessGate, GlitchProvider } from '@/lib/glitch/GlitchProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AudioProvider>
      <GlitchProvider>
        <GlitchAccessGate>
          {children}
        </GlitchAccessGate>
      </GlitchProvider>
    </AudioProvider>
  );
}

