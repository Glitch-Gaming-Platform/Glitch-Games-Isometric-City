import { GlitchClient, GlitchInstall, GlitchInstallValidation } from './client';
import { GlitchGameKey } from './config';

const INSTALL_ID_PREFIX = 'glitch-install-id';
const USER_INSTALL_ID_PREFIX = 'glitch-user-install-id';
const SESSION_ID_PREFIX = 'glitch-session-id';

interface GlitchLaunchInstallContext {
  installId: string;
  userInstallId: string;
  sessionId: string;
}

export interface GlitchInstallSession {
  install: GlitchInstall;
  validation: GlitchInstallValidation;
  userInstallId: string;
  sessionId: string;
}

export function getStableUserInstallId(gameKey: GlitchGameKey): string {
  if (typeof window === 'undefined') return `${gameKey}-server-render`;
  const launchContext = readGlitchLaunchInstallContext(gameKey);
  if (launchContext?.userInstallId) {
    window.localStorage.setItem(`${USER_INSTALL_ID_PREFIX}:${gameKey}`, launchContext.userInstallId);
    return launchContext.userInstallId;
  }
  const key = `${USER_INSTALL_ID_PREFIX}:${gameKey}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = `${gameKey}:web:${crypto.randomUUID()}`;
  window.localStorage.setItem(key, id);
  return id;
}

export function getStableSessionId(gameKey: GlitchGameKey): string {
  if (typeof window === 'undefined') return `${gameKey}-server-session`;
  const launchContext = readGlitchLaunchInstallContext(gameKey);
  if (launchContext?.sessionId) {
    window.sessionStorage.setItem(`${SESSION_ID_PREFIX}:${gameKey}`, launchContext.sessionId);
    return launchContext.sessionId;
  }
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
  const launchContext = readGlitchLaunchInstallContext(gameKey);
  if (launchContext) {
    persistInstallId(gameKey, launchContext.installId);
    const validation = await client.validateInstall(launchContext.installId);
    return {
      install: buildLaunchInstall(client, launchContext, validation.user_id ?? null),
      validation,
      userInstallId: launchContext.userInstallId,
      sessionId: launchContext.sessionId,
    };
  }

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
    const launchContext = readGlitchLaunchInstallContext(gameKey);
    if (launchContext) {
      await client.validateInstall(launchContext.installId);
      persistInstallId(gameKey, launchContext.installId);
      return buildLaunchInstall(client, launchContext, null);
    }

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

function readGlitchLaunchInstallContext(gameKey: GlitchGameKey): GlitchLaunchInstallContext | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const installId = params.get('install_id');
  if (!installId || !looksLikeUuid(installId)) return null;

  const userInstallId = params.get('user_install_id') || installId;
  const sessionId = params.get('session_id') || getStoredSessionId(gameKey) || installId;
  return { installId, userInstallId, sessionId };
}

function buildLaunchInstall(client: GlitchClient, launchContext: GlitchLaunchInstallContext, userId: string | null): GlitchInstall {
  return {
    id: launchContext.installId,
    title_id: client.titleId,
    user_id: userId,
    user_install_id: launchContext.userInstallId,
    platform: 'web',
    device_type: inferDeviceType(),
    operating_system: inferOperatingSystem().toLowerCase(),
    game_version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    build_type: 'production',
  };
}

function getStoredSessionId(gameKey: GlitchGameKey): string | null {
  try {
    return window.sessionStorage.getItem(`${SESSION_ID_PREFIX}:${gameKey}`);
  } catch {
    return null;
  }
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
