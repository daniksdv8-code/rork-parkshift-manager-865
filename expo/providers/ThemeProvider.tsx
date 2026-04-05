import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { DarkColors, LightColors, ThemeColors } from '@/constants/colors';

export type ThemeMode = 'dark' | 'light';

const THEME_KEY = 'park_theme';

export const [ThemeProvider, useTheme] = createContextHook(() => {
  /* eslint-disable rork/general-context-optimization */
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setMode(saved);
      }
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
    AsyncStorage.setItem(THEME_KEY, newMode).catch(() => {});
  }, []);

  const colors: ThemeColors = useMemo(() =>
    mode === 'dark' ? DarkColors : LightColors,
  [mode]);

  const isDark = mode === 'dark';

  return { mode, isDark, colors, toggleTheme, setTheme, isLoaded };
});

export function useColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}
