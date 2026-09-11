/**
 * Auto display scaling.
 *
 * Electron exposes no monitor physical-size API — `Display` carries bounds,
 * size, scaleFactor and id, but no inches — so pixel density cannot be measured
 * directly. The proxy is the display's short side in DIP: across screens of
 * comparable physical size, DIP short side grows in proportion to pixel density,
 * so scaling by its ratio normalises how large the UI actually appears.
 *
 * The short side (rather than width or height alone) is what keeps ultrawide and
 * portrait panels honest: a 3440x1440 ultrawide is no denser than a 2560x1440
 * panel but is much wider, so scaling by width would overshoot badly.
 *
 * This only ever enlarges. Never shrinking below 1x means a display that reports
 * an unexpectedly small DIP size is left alone rather than made unreadable.
 */

/** DIP short side that maps to 1.0 — calibrated against a 2560x1440 @ 125% panel. */
export const REFERENCE_SHORT_SIDE = 1200;

/** Auto scaling never shrinks the UI. */
export const MIN_AUTO_ZOOM = 1;

/** Upper bound, so a misreported display cannot blow the layout apart. */
export const MAX_AUTO_ZOOM = 2;

export interface DisplaySize {
  width: number;
  height: number;
}

/**
 * Zoom factor that makes this display's UI density match {@link REFERENCE_SHORT_SIDE}.
 * Returns {@link MIN_AUTO_ZOOM} when the metrics are unusable.
 */
export function computeAutoZoomFactor(display: DisplaySize): number {
  const shortSide = Math.min(display.width, display.height);
  if (!Number.isFinite(shortSide) || shortSide <= 0) return MIN_AUTO_ZOOM;
  const raw = shortSide / REFERENCE_SHORT_SIDE;
  return Math.min(MAX_AUTO_ZOOM, Math.max(MIN_AUTO_ZOOM, raw));
}
