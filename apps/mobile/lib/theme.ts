import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Appearance as RNAppearance, useColorScheme } from 'react-native';

export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCE_STORAGE_KEY = 'fitness.appearance';

function isAppearance(value: unknown): value is Appearance {
  return value === 'system' || value === 'light' || value === 'dark';
}

export async function readStoredAppearance(): Promise<Appearance> {
  try {
    const stored = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearance(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyAppearance(value: Appearance): void {
  RNAppearance.setColorScheme(value === 'system' ? 'unspecified' : value);
}

export async function setAppearance(value: Appearance): Promise<void> {
  applyAppearance(value);
  try {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, value);
  } catch {
    // A failed persist must not undo the applyAppearance() call above or surface
    // as an error — UI-SPEC E7's error backstop requires the app to keep working.
  }
}

export function useAppearance() {
  const colorScheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('system');

  useEffect(() => {
    let mounted = true;
    readStoredAppearance().then((stored) => {
      if (!mounted) return;
      setAppearanceState(stored);
      applyAppearance(stored);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const select = useCallback((value: Appearance) => {
    setAppearanceState(value);
    void setAppearance(value);
  }, []);

  return { appearance, colorScheme, setAppearance: select };
}
