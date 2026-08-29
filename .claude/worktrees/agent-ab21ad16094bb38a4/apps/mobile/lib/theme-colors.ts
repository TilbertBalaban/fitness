// NativeWind's hook, not React Native's. On web RN's useColorScheme reports only the OS
// prefers-color-scheme media query, so it does not see the in-app appearance override that
// applyAppearance applies through NativeWind — native tab tints would stay on the light palette
// while every className-styled surface around them repainted dark.
import { useColorScheme } from 'nativewind';

// These duplicate the `--color-*` values in global.css and must be edited together. NativeTabs
// renders real native tab-bar controllers whose tint props take a resolved ColorValue, so they can
// never read the CSS variables the NativeWind classes resolve against — a divergence here shows up
// as native tab tints drifting from the rest of the app.
export interface ThemeColors {
  accent: string;
  foregroundMuted: string;
  surface: string;
}

const PALETTE: Record<'light' | 'dark', ThemeColors> = {
  light: {
    accent: 'rgb(37, 99, 235)',
    foregroundMuted: 'rgb(113, 113, 122)',
    surface: 'rgb(244, 244, 245)',
  },
  dark: {
    accent: 'rgb(59, 130, 246)',
    foregroundMuted: 'rgb(161, 161, 170)',
    surface: 'rgb(24, 24, 27)',
  },
};

export function useThemeColors(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? PALETTE.dark : PALETTE.light;
}
