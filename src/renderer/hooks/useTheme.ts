/**
 * useTheme - Shared theme state: mode (dark/light) + colorway.
 *
 * Mode is driven by the `light` class on <html>, colorway by the
 * `data-colorway` attribute. Both are persisted to localStorage and read by
 * index.html before React mounts to avoid a flash of the wrong theme.
 *
 * Multiple components (sidebar toggle, Win/Linux CustomTitleBar toggle) share
 * this hook. Changing either axis dispatches THEME_CHANGE_EVENT so every
 * mounted instance stays in sync even though each holds its own local state.
 */

import { useCallback, useEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'cc-memory-theme-cache';
export const COLORWAY_STORAGE_KEY = 'cc-memory-colorway';
export const THEME_CHANGE_EVENT = 'cc-memory-theme-change';

/** Accent colorways, all built on the same surface/accent token contract. */
export const COLORWAYS = ['indigo', 'teal', 'violet', 'amber', 'rose', 'mono'] as const;
export type Colorway = (typeof COLORWAYS)[number];
export const DEFAULT_COLORWAY: Colorway = 'indigo';

export const COLORWAY_LABELS: Record<Colorway, string> = {
  indigo: 'Indigo',
  teal: 'Teal',
  violet: 'Violet',
  amber: 'Amber',
  rose: 'Rose',
  mono: 'Mono',
};

/** Swatch shown in the theme picker — the accent each colorway resolves to. */
export const COLORWAY_SWATCHES: Record<Colorway, string> = {
  indigo: '#5e6ad2',
  teal: '#14b8a6',
  violet: '#8b5cf6',
  amber: '#f59e0b',
  rose: '#f43f5e',
  mono: '#a1a1aa',
};

function isLightTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light');
}

function isColorway(value: string | null): value is Colorway {
  return value !== null && (COLORWAYS as readonly string[]).includes(value);
}

/** Resolve the colorway currently applied to <html> (index.html sets it pre-mount). */
export function currentColorway(): Colorway {
  if (typeof document === 'undefined') return DEFAULT_COLORWAY;
  const attr = document.documentElement.getAttribute('data-colorway');
  return isColorway(attr) ? attr : DEFAULT_COLORWAY;
}

export function useTheme() {
  const [isLight, setIsLight] = useState<boolean>(isLightTheme);
  const [colorway, setColorwayState] = useState<Colorway>(currentColorway);

  useEffect(() => {
    const sync = (): void => {
      setIsLight(isLightTheme());
      setColorwayState(currentColorway());
    };
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  const setTheme = useCallback((light: boolean): void => {
    const root = document.documentElement;
    root.classList.toggle('light', light);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, light ? 'light' : 'dark');
    } catch {
      /* */
    }
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
  }, []);

  const toggleTheme = useCallback((): void => setTheme(!isLightTheme()), [setTheme]);

  const setColorway = useCallback((next: Colorway): void => {
    document.documentElement.setAttribute('data-colorway', next);
    try {
      localStorage.setItem(COLORWAY_STORAGE_KEY, next);
    } catch {
      /* */
    }
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
  }, []);

  return { isLight, colorway, setTheme, toggleTheme, setColorway };
}
