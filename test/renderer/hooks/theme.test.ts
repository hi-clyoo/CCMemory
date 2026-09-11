/**
 * Theme system contract tests.
 *
 * The theme is split across two files that have to agree: useTheme.ts owns the
 * colorway list, index.css owns the token values keyed off `data-colorway`.
 * A rename or a forgotten colorway in either half breaks the app silently (the
 * UI just falls back to the default accent), so the pairing is asserted here.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  COLORWAYS,
  COLORWAY_LABELS,
  COLORWAY_SWATCHES,
  DEFAULT_COLORWAY,
  currentColorway,
} from '@renderer/hooks/useTheme';

const css = readFileSync(resolve(process.cwd(), 'src/renderer/index.css'), 'utf8');

/**
 * Concatenated bodies of every rule whose selector matches `selector` exactly.
 * The base tokens are split across two `:root {` blocks (mode-level tokens, then
 * the default colorway), so a single-block lookup would miss half of them.
 */
function blockBody(selector: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const start = css.indexOf(`${selector} {`, from);
    if (start === -1) return out;
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    out += css.slice(open + 1, close);
    from = close;
  }
}

function tokenValue(selector: string, token: string): string | undefined {
  return new RegExp(`${token}:\\s*([^;]+);`).exec(blockBody(selector))?.[1]?.trim();
}

describe('colorway resolution', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-colorway');
  });

  it('falls back to the default when <html> carries no colorway', () => {
    expect(currentColorway()).toBe(DEFAULT_COLORWAY);
  });

  it('reads the colorway applied to <html>', () => {
    document.documentElement.setAttribute('data-colorway', 'rose');
    expect(currentColorway()).toBe('rose');
  });

  it('ignores an unknown colorway rather than leaving the theme unstyled', () => {
    document.documentElement.setAttribute('data-colorway', 'chartreuse');
    expect(currentColorway()).toBe(DEFAULT_COLORWAY);
  });
});

describe('colorway metadata', () => {
  it('exposes six colorways with a label and a readable swatch each', () => {
    expect(COLORWAYS).toHaveLength(6);
    for (const colorway of COLORWAYS) {
      expect(COLORWAY_LABELS[colorway]).toBeTruthy();
      // Swatches render on both light and dark panels, so they are mid-tone
      // rather than the raw accent value.
      expect(COLORWAY_SWATCHES[colorway]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('index.css theme contract', () => {
  const CORE_TOKENS = [
    '--color-surface',
    '--color-surface-sidebar',
    '--color-surface-raised',
    '--color-surface-overlay',
    '--color-border',
    '--color-text',
    '--color-text-secondary',
    '--color-text-muted',
    '--color-accent',
    '--color-accent-fg',
    '--color-accent-subtle',
    '--color-accent-ring',
  ];

  it('declares every core token in the base block', () => {
    for (const token of CORE_TOKENS) {
      expect(tokenValue(':root', token)).toBeTruthy();
    }
  });

  it('gives every non-default colorway a dark and a light block with its own accent', () => {
    for (const colorway of COLORWAYS.filter((c) => c !== DEFAULT_COLORWAY)) {
      const dark = `:root[data-colorway='${colorway}']`;
      const light = `:root.light[data-colorway='${colorway}']`;
      expect(tokenValue(dark, '--color-accent')).toBeTruthy();
      expect(tokenValue(light, '--color-accent')).toBeTruthy();
    }
  });

  it('overrides the base accent in light mode instead of reusing the dark one', () => {
    expect(tokenValue(':root.light', '--color-accent')).not.toBe(
      tokenValue(':root', '--color-accent')
    );
  });

  it('ships an opaque fallback for the frosted shell', () => {
    expect(css).toContain('@supports not');
    expect(css).toContain('.glass');
  });
});
