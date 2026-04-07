import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setBaseUrl } from '@workspace/api-client-react';
import { getIsOnline } from './NetworkContext';
import { cacheCharacter, getCachedCharacter } from '@/lib/offlineCache';
import { API_URL } from "../constants/api";

const RAW_DOMAIN = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_DOMAIN;
if (!RAW_DOMAIN) {
  console.error('[GymQuest] EXPO_PUBLIC_DOMAIN or EXPO_PUBLIC_API_URL must be set');
}
const DOMAIN = RAW_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/+$/, '') || '';
const BASE_URL = DOMAIN ? `https://${DOMAIN}` : '';
setBaseUrl(BASE_URL);
if (__DEV__) console.log(`[GymQuest] API base: ${BASE_URL}/api`);

export type CharacterClass =
  | 'barbarian' | 'fighter' | 'paladin' | 'monk' | 'rogue' | 'ranger'
  | 'wizard' | 'cleric' | 'druid' | 'sorcerer' | 'warlock' | 'bard'
  | 'warrior' | 'mage' | 'archer';
export type LeagueTier = 'demir' | 'bronz' | 'gumus' | 'altin' | 'platin' | 'sampiyonluk';

export interface Character {
  id: string;
  userId: string;
  name: string;
  class: CharacterClass;
  race: string;
  level: number;
  exp: number;
  expToNextLevel: number;
  totalExp: number;
  region: string;
  strength: number;
  agility: number;
  endurance: number;
  totalWorkouts: number;
  totalXpEarned: number;
  totalCalories: number;
  league: LeagueTier;
  questStreak: number;
  streakActive: boolean;
  gymCoins: number;
  gems: number;
  equippedAura: string | null;
  streakDays: number;
  lastWorkoutAt: string | null;
  lastStreakDate: string | null;
  timezone: string;
  hasAcceptedDisclaimer: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GameContextValue {
  userId: string;
  character: Character | null;
  isLoading: boolean;
  isOnboarded: boolean;
  initError: string | null;
  refreshCharacter: () => Promise<void>;
  setCharacter: (c: Character) => void;
  completeOnboarding: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

const API_BASE = `${BASE_URL}/api`;

let _authToken: string | null = null;

export function getAuthToken(): string | null {
  return _authToken;
}

export async function setAuthToken(token: string) {
  _authToken = token;
  await AsyncStorage.setItem('gymquest_auth_token', token);
}

export class OfflineError extends Error {
  constructor() {
    super('Internet baglantisi yok');
  }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 1): Promise<Response> {
  if (!getIsOnline()) {
    throw new OfflineError();
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const finalUrl = url.startsWith("http")
  ? url
  : API_URL + url;

return await fetch(finalUrl, options);
    } catch (netErr: any) {
      if (attempt < retries) {
        if (__DEV__) console.warn(`[GymQuest API] Retry ${attempt + 1}/${retries} for ${url}: ${netErr.message}`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error(`[GymQuest API] Network failed after ${retries + 1} attempts: ${url}`, netErr.message);
      throw netErr;
    }
  }
  throw new Error('Unexpected retry exhaustion');
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  if (__DEV__) console.log(`[GymQuest API] GET ${url}`);
  const headers: Record<string, string> = {};
  if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`;
  const res = await fetchWithRetry(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status >= 500) {
      console.error(`[GymQuest API] GET ${path} server error: ${res.status}`);
    }
    throw new ApiError(err.error || `API hatasi ${res.status}`, res.status, err.code, err.remainingSeconds);
  }
  const data = await res.json();
  if (__DEV__) console.log(`[GymQuest API] GET ${path} success`);
  return data;
}

export class ApiError extends Error {
  code?: string;
  status: number;
  remainingSeconds?: number;
  constructor(message: string, status: number, code?: string, remainingSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.remainingSeconds = remainingSeconds;
  }
}

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: string;
  code?: string;
  status: number;
  remainingSeconds?: number;
  xpEarned?: number;
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  const url = `${API_BASE}${path}`;
  if (__DEV__) console.log(`[GymQuest API] POST ${url}`);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`;
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    if (res.status >= 500) {
      console.error(`[GymQuest API] POST ${path} server error: ${res.status}`);
      throw new ApiError(
        err?.error || 'Sunucu hatasi',
        res.status,
        err?.code,
        err?.remainingSeconds
      );
    }
    if (__DEV__) console.warn(`[GymQuest API] POST ${path} validation: ${res.status}`, err);
    return {
      ok: false,
      error: err?.error || `Islem basarisiz (${res.status})`,
      code: err?.code,
      status: res.status,
      remainingSeconds: err?.remainingSeconds,
      xpEarned: err?.xpEarned ?? 0,
    };
  }
  const data = await res.json();
  if (__DEV__) console.log(`[GymQuest API] POST ${path} success`);
  return { ok: true, data };
}

export async function apiDelete<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  if (__DEV__) console.log(`[GymQuest API] DELETE ${url}`);
  const headers: Record<string, string> = {};
  if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`;
  const res = await fetchWithRetry(url, { method: 'DELETE', headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status >= 500) {
      console.error(`[GymQuest API] DELETE ${path} server error: ${res.status}`);
    }
    throw new ApiError(err.error || `API hatasi ${res.status}`, res.status, err.code);
  }
  const data = await res.json();
  if (__DEV__) console.log(`[GymQuest API] DELETE ${path} success`);
  return data;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string>('');
  const [character, setCharacter] = useState<Character | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (__DEV__) console.log('[GymQuest] GameProvider mounting, starting initUser...');
    initUser();
  }, []);

  async function initUser() {
    try {
      let uid = await AsyncStorage.getItem('gymquest_user_id');
      if (!uid) {
        uid = 'user_' + Date.now().toString() + Math.random().toString(36).substr(2, 6);
        await AsyncStorage.setItem('gymquest_user_id', uid);
        if (__DEV__) console.log('[GymQuest] New user created:', uid);
      } else {
        if (__DEV__) console.log('[GymQuest] Existing user loaded:', uid);
      }
      setUserId(uid);

      const storedToken = await AsyncStorage.getItem('gymquest_auth_token');
      if (storedToken) {
        _authToken = storedToken;
        if (__DEV__) console.log('[GymQuest] Auth token restored');
      }

      const onboarded = await AsyncStorage.getItem('gymquest_onboarded');
      setIsOnboarded(onboarded === 'true');
      if (__DEV__) console.log('[GymQuest] Onboarded status:', onboarded === 'true');

      if (onboarded === 'true' && storedToken) {
        try {
          const char = await apiGet<Character>('/character');
          setCharacter(char);
          cacheCharacter(char);
          if (__DEV__) console.log('[GymQuest] Character loaded:', char.name, 'Level', char.level);
        } catch (charErr: any) {
          if (__DEV__) console.warn('[GymQuest] Failed to load character:', charErr?.message);
          const cached = await getCachedCharacter();
          if (cached) {
            setCharacter(cached);
            if (__DEV__) console.log('[GymQuest] Loaded cached character:', cached.name);
          } else {
            setInitError(charErr?.message || 'Karakter yuklenemedi');
          }
        }
      }
    } catch (e: any) {
      console.error('[GymQuest] initUser critical error:', e?.message);
      setInitError(e?.message || 'Baslangic hatasi');
    } finally {
      setIsLoading(false);
      if (__DEV__) console.log('[GymQuest] initUser complete, isLoading=false');
    }
  }

  async function refreshCharacter() {
    if (!_authToken) {
      if (__DEV__) console.warn('[GymQuest] refreshCharacter skipped: no auth token');
      return;
    }
    if (!getIsOnline()) {
      if (__DEV__) console.log('[GymQuest] refreshCharacter skipped: offline');
      return;
    }
    try {
      const char = await apiGet<Character>('/character');
      setCharacter(char);
      setInitError(null);
      cacheCharacter(char);
    } catch (e: any) {
      if (__DEV__) console.warn('[GymQuest] refreshCharacter failed:', e?.message);
      if (!(e instanceof OfflineError)) {
        setInitError(e?.message || 'Karakter yuklenemedi');
      }
    }
  }

  function completeOnboarding() {
    AsyncStorage.setItem('gymquest_onboarded', 'true');
    setIsOnboarded(true);
  }

  const value = useMemo(() => ({
    userId,
    character,
    isLoading,
    isOnboarded,
    initError,
    refreshCharacter,
    setCharacter,
    completeOnboarding,
  }), [userId, character, isLoading, isOnboarded, initError]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame GameProvider i\u00e7inde kullan\u0131lmal\u0131d\u0131r');
  return ctx;
}
