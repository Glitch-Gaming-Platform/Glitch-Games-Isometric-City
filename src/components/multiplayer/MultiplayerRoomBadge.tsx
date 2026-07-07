'use client';

import React from 'react';
import { Check, Copy, Mic, MicOff } from 'lucide-react';
import { useMultiplayerOptional } from '@/context/MultiplayerContext';
import { useCopyRoomLink } from '@/hooks/useCopyRoomLink';
import { MultiplayerCommsPanel } from './MultiplayerCommsPanel';
import { Player } from '@/lib/multiplayer/types';

interface MultiplayerRoomBadgeProps {
  roomCode: string | null;
  players: Player[];
  copyPath: string;
  statusColorClassName?: string;
  compact?: boolean;
}

export function MultiplayerRoomBadge({
  roomCode,
  players,
  copyPath,
  statusColorClassName = 'bg-emerald-500',
  compact = false,
}: MultiplayerRoomBadgeProps) {
  const multiplayer = useMultiplayerOptional();
  const { copied: copiedRoomLink, handleCopyRoomLink } = useCopyRoomLink(roomCode, copyPath);
  if (!roomCode || !multiplayer || multiplayer.connectionState !== 'connected') return null;

  const voiceConnected =
    multiplayer.voiceState.status === 'connected' ||
    multiplayer.voiceState.status === 'muted' ||
    multiplayer.voiceState.status === 'deafened';

  return (
    <div className="bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-2 shadow-lg min-w-[180px]">
      <div className="flex items-center gap-2 text-sm text-white">
        <span className="font-mono font-medium tracking-wider">{roomCode}</span>
        <button
          type="button"
          onClick={handleCopyRoomLink}
          className="h-7 w-7 inline-flex items-center justify-center hover:bg-white/10 rounded transition-colors"
          title="Copy invite link"
          aria-label="Copy invite link"
        >
          {copiedRoomLink ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
          )}
        </button>
        <MultiplayerCommsPanel
          className="relative"
          showButtonLabel={!compact}
          buttonClassName="h-7 inline-flex items-center justify-center px-2 border border-slate-700 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
          panelClassName="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] bg-slate-950/95 border border-slate-700 text-white shadow-xl"
        />
        <button
          type="button"
          onClick={() => {
            if (voiceConnected) {
              void multiplayer.stopVoiceChat();
            } else {
              void multiplayer.startVoiceChat();
            }
          }}
          className="h-7 inline-flex items-center justify-center gap-1 px-2 border border-slate-700 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-50"
          disabled={multiplayer.voiceState.status === 'joining'}
          title={voiceConnected ? 'Leave voice chat' : 'Join voice chat'}
          aria-label={voiceConnected ? 'Leave voice chat' : 'Join voice chat'}
        >
          {voiceConnected ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          {!compact && <span className="text-xs">Talk</span>}
        </button>
      </div>
      {players.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {players.map((player) => (
            <div key={player.id} className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className={`w-2 h-2 rounded-full ${statusColorClassName}`} />
              {player.name}
            </div>
          ))}
        </div>
      )}
      {multiplayer.voiceState.error && (
        <div className="mt-1 text-[10px] leading-tight text-amber-300">
          {multiplayer.voiceState.error}
        </div>
      )}
    </div>
  );
}
