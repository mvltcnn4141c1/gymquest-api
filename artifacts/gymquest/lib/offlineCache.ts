import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEYS = {
  character: 'gymquest_cache_character',
  workouts: 'gymquest_cache_workouts',
} as const;

export async function cacheCharacter(data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.character, JSON.stringify(data));
  } catch {}
}

export async function getCachedCharacter(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.character);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheWorkouts(data: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.workouts, JSON.stringify(data));
  } catch {}
}

export async function getCachedWorkouts(): Promise<any[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.workouts);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearOfflineCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(CACHE_KEYS));
  } catch {}
}
