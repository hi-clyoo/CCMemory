---
globs: ["**/*.css", "src/renderer/**/*.tsx"]
---

# Tailwind CSS Conventions

## Theme Architecture

Two independent axes, composed on `<html>`:

| Axis | Applied as | Owned by | Default |
|------|-----------|----------|---------|
| mode | `.light` class | `useTheme.setTheme` | dark |
| colorway | `data-colorway="…"` attribute | `useTheme.setColorway` | `indigo` |

Colorways: `indigo` · `teal` · `violet` · `amber` · `rose` · `mono`.

Each colorway overrides **only surfaces + accent**. Border and text colors stay at
mode level, so contrast never depends on the hue. All values live in
`src/renderer/index.css`, keyed as:

```css
:root                                    /* dark, indigo (default) */
:root[data-colorway='teal']              /* dark, other colorways */
:root.light                              /* light, indigo */
:root.light[data-colorway='teal']        /* light, other colorways */
```

`src/renderer/index.html` reads both keys from localStorage before React mounts so
the first paint already has the right theme.

## Token Set

This is the complete list. Anything not here does not exist — the file previously
carried ~250 dead variables inherited from claude-devtools (chat bubbles, tool
blocks, diff viewer, …) for UI this app does not have.

### Mode level (text + border, same for every colorway)
```css
--color-border          --color-text             /* primary */
--color-border-subtle   --color-text-secondary
--color-border-emphasis --color-text-muted
```

### Colorway level (surfaces + accent)
```css
--color-surface          /* main content column */
--color-surface-sidebar  /* column 1 */
--color-surface-raised   /* hover / selected row */
--color-surface-overlay
--color-accent           /* the one accent for the active colorway */
--color-accent-fg        /* text on an accent-filled button */
--color-accent-subtle    /* selected-row tint */
--color-accent-ring
--app-glow-1             /* canvas radial glows — give the glass something to blur */
--app-glow-2
```

### Shared
```css
--scrollbar-thumb / -hover / -active
--color-line-highlight   /* CodeMirror jump-back highlight */
--glass-blur / --glass-saturate / --glass-bg / --glass-border
```

### Semantic category colors — NOT themeable
`Project` `#F97316` · `Local` `#22C55E` · `AutoMem` `#EC4899` · `Index` `#06B6D4`
· `Managed` `#A855F7` · `User` `#3B82F6`.

These identify the file type, so they must stay recognisable across every colorway.
They live in `GROUP_DEFS` in `App.tsx`, not in CSS.

## Tailwind Usage

```tsx
// Surfaces / text / border
<div className="bg-surface text-text border-border">
<div className="glass border-border">          // translucent frosted shell

// Accent (drives the active colorway)
<button className="bg-accent text-accent-fg">
<div className="bg-accent-subtle shadow-[inset_2px_0_0_var(--color-accent)]">
```

### Density scale
`extend.fontSize` remaps two steps; prefer these over arbitrary values.

| Class | Size | Use |
|-------|------|-----|
| `text-xs` | 13px | list rows, labels, buttons |
| `text-2xs` | 11px | metadata: token counts, paths, section headers |

`extend.borderRadius.DEFAULT` is `6px`, so plain `rounded` matches the design.

## Frosted Glass

`.glass` applies `backdrop-filter` + a translucent background, and falls back to an
opaque panel under `@supports not (backdrop-filter)`. `.app-canvas` paints the
radial glow the glass blurs.

**Apply it only to static shells** — the two sidebar columns and the title bar.
Never to a scrolling list row: a per-row `backdrop-filter` in a long list drops
frames badly.

Note: native acrylic/mica is deliberately not used. Electron exposes it as
`vibrancy` (macOS only) / `backgroundMaterial` (Windows 11 only), so it is
unavailable on Windows 10 and cannot be tested on the dev machine — the CSS
approach behaves identically on every platform.
