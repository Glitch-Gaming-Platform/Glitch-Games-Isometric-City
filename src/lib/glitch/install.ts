import { GlitchClient, GlitchInstall, GlitchInstallValidation } from './client';
import { GlitchGameKey } from './config';

const INSTALL_ID_PREFIX = 'glitch-install-id';
const USER_INSTALL_ID_PREFIX = 'glitch-user-install-id';
const SESSION_ID_PREFIX = 'glitch-session-id';

export interface GlitchInstallSession {
  install: GlitchInstall;
  validation: GlitchInstallValidation;
  userInstallId: string;
  sessionId: string;
}

export function getStableUserInstallId(gameKey: GlitchGameKey): string {
  if (typeof window === 'undefined') return `${gameKey}-server-render`;
  const key = `${USER_INSTALL_ID_PREFIX}:${gameKey}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = `${gameKey}:web:${crypto.randomUUID()}`;
  window.localStorage.setItem(key, id);
  return id;
}

export function getStableSessionId(gameKey: GlitchGameKey): string {
  if (typeof window === 'undefined') return `${gameKey}-server-session`;
  const key = `${SESSION_ID_PREFIX}:${gameKey}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const id = `${gameKey}:session:${crypto.randomUUID()}`;
  window.sessionStorage.setItem(key, id);
  return id;
}

export function getPersistedInstallId(gameKey: GlitchGameKey): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(`${INSTALL_ID_PREFIX}:${gameKey}`);
}

export function persistInstallId(gameKey: GlitchGameKey, installId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${INSTALL_ID_PREFIX}:${gameKey}`, installId);
}

export function forgetInstallId(gameKey: GlitchGameKey): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(`${INSTALL_ID_PREFIX}:${gameKey}`);
}

export async function createOrReuseInstall(client: GlitchClient, gameKey: GlitchGameKey): Promise<GlitchInstallSession> {
  const userInstallId = getStableUserInstallId(gameKey);
  const sessionId = getStableSessionId(gameKey);
  const installResponse = await client.createInstall({
    user_install_id: userInstallId,
    platform: 'web',
    device_type: inferDeviceType(),
    operating_system: inferOperatingSystem(),
    game_version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    build_type: 'production',
    device_id: userInstallId,
    session_id: sessionId,
  });
  persistInstallId(gameKey, installResponse.data.id);

  const validation = await client.validateInstall(installResponse.data.id, {
    device_id: userInstallId,
  });

  return {
    install: installResponse.data,
    validation,
    userInstallId,
    sessionId,
  };
}

export async function refreshInstallHeartbeat(client: GlitchClient, gameKey: GlitchGameKey): Promise<GlitchInstall | null> {
  try {
    const userInstallId = getStableUserInstallId(gameKey);
    const sessionId = getStableSessionId(gameKey);
    const response = await client.createInstall({
      user_install_id: userInstallId,
      platform: 'web',
      device_type: inferDeviceType(),
      operating_system: inferOperatingSystem(),
      game_version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
      build_type: 'production',
      device_id: userInstallId,
      session_id: sessionId,
    });
    persistInstallId(gameKey, response.data.id);
    return response.data;
  } catch (error) {
    console.warn('[Glitch] Install heartbeat failed:', error);
    return null;
  }
}

function inferDeviceType(): string {
  if (typeof navigator === 'undefined') return 'desktop';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    ? 'mobile'
    : 'desktop';
}

function inferOperatingSystem(): string {
  if (typeof navigator === 'undefined') return 'browser';
  return navigator.platform || 'browser';
}

