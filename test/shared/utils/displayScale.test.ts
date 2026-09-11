/**
 * Auto display-scaling tests.
 *
 * Electron exposes no monitor physical-size API, so density cannot be measured
 * directly. The proxy is the display's short side in DIP: for screens of
 * comparable physical size, DIP short side is inversely proportional to pixel
 * density, which is exactly what we need to normalise.
 *
 * The reference (1200 DIP) is chosen so a 2560x1440 panel at Windows 125%
 * scaling — the configuration this was calibrated against — lands on the 1.0
 * floor and stays untouched.
 */

import {
  MAX_AUTO_ZOOM,
  MIN_AUTO_ZOOM,
  REFERENCE_SHORT_SIDE,
  computeAutoZoomFactor,
} from '@shared/utils/displayScale';

describe('computeAutoZoomFactor', () => {
  it('leaves the calibrated 2K @ 125% display untouched', () => {
    // 2560x1440 physical / 1.25 = 2048x1152 DIP
    expect(computeAutoZoomFactor({ width: 2048, height: 1152 })).toBe(MIN_AUTO_ZOOM);
  });

  it('never zooms below 1x, however coarse the display', () => {
    expect(computeAutoZoomFactor({ width: 1920, height: 1080 })).toBe(MIN_AUTO_ZOOM);
    expect(computeAutoZoomFactor({ width: 1280, height: 720 })).toBe(MIN_AUTO_ZOOM);
  });

  it('scales up a 4K panel in proportion to its density', () => {
    // Same physical size as the 2K reference, so the ratio is the short-side ratio.
    expect(computeAutoZoomFactor({ width: 3840, height: 2160 })).toBeCloseTo(1.8, 5); // 4K @ 100%
    expect(computeAutoZoomFactor({ width: 3072, height: 1728 })).toBeCloseTo(1.44, 5); // 4K @ 125%
    expect(computeAutoZoomFactor({ width: 2560, height: 1440 })).toBeCloseTo(1.2, 5); // 4K @ 150%
  });

  it('uses the short side, so ultrawide and portrait panels are not over-scaled', () => {
    // 3440x1440 ultrawide @ 100% — scaling by width would give 1.25+ and look huge.
    expect(computeAutoZoomFactor({ width: 3440, height: 1440 })).toBeCloseTo(1.2, 5);
    // 1440x2560 portrait @ 100%
    expect(computeAutoZoomFactor({ width: 1440, height: 2560 })).toBeCloseTo(1.2, 5);
  });

  it('caps runaway scaling on extreme displays', () => {
    expect(computeAutoZoomFactor({ width: 7680, height: 4320 })).toBe(MAX_AUTO_ZOOM);
  });

  it('falls back to 1x for unusable metrics rather than producing NaN zoom', () => {
    expect(computeAutoZoomFactor({ width: 0, height: 0 })).toBe(MIN_AUTO_ZOOM);
    expect(computeAutoZoomFactor({ width: Number.NaN, height: 1152 })).toBe(MIN_AUTO_ZOOM);
    expect(computeAutoZoomFactor({ width: -2048, height: -1152 })).toBe(MIN_AUTO_ZOOM);
    expect(computeAutoZoomFactor({ width: Number.NaN, height: Number.NaN })).toBe(MIN_AUTO_ZOOM);
    // An infinite width with a sane height still has a usable short side.
    expect(computeAutoZoomFactor({ width: Number.POSITIVE_INFINITY, height: 1152 })).toBe(
      MIN_AUTO_ZOOM
    );
  });

  it('is monotonic in density', () => {
    const zooms = [1080, 1440, 1728, 2160].map((height) =>
      computeAutoZoomFactor({ width: Math.round((height * 16) / 9), height })
    );
    for (let i = 1; i < zooms.length; i++) {
      expect(zooms[i]).toBeGreaterThanOrEqual(zooms[i - 1]);
    }
  });

  it('exposes the reference the calibration depends on', () => {
    expect(REFERENCE_SHORT_SIDE).toBe(1200);
  });
});
