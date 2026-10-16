import {
  MIN_COMPARABLE, rollingMedian, buildFaceTrend, trendAt, faceHeadline, photoReadout, compareDays, trendGeometry, comparableCount,
  type TrendPhoto,
} from '@/utils/faceTrend';
import type { FaceMeasure } from '@/types';

const base: FaceMeasure = { ipd: 200, closeness: 0.2, jaw: 2, lowJaw: 1.5, cheek: 2.5, yaw: 0, pitch: 10, roll: 0, smile: 0, jawOpen: 0 };
const iso = (day: number) => new Date(Date.UTC(2025, 0, 1) + day * 86400000).toISOString().slice(0, 10);

/** One photo per day; index(day) = width index before closeness/pitch effects. */
function album(days: number, opts: { index?: (d: number) => number; closeness?: (d: number) => number; measure?: (d: number) => Partial<FaceMeasure> | null } = {}): TrendPhoto[] {
  const index = opts.index ?? (() => 1.75);
  const close = opts.closeness ?? (() => 0.2);
  return Array.from({ length: days }, (_, d) => {
    const extra = opts.measure?.(d);
    // jaw and lowJaw share the index; closer (bigger closeness) reads narrower, -1.5% per +10%.
    const effect = 1 - 0.15 * Math.log(close(d) / 0.2) / Math.log(1.1) * 0.1;
    const v = index(d) * effect;
    return {
      id: `p${d}`,
      date: iso(d),
      faceScan: { v: 2, eyes: null, width: 1000, height: 2000, measure: extra === null ? null : { ...base, jaw: v, lowJaw: v, closeness: close(d), ...extra } },
    };
  });
}

describe('rollingMedian', () => {
  it('is the median of values within ±15 days', () => {
    expect(rollingMedian([0, 1, 2, 3, 4], [5, 1, 4, 2, 3])).toEqual([3, 3, 3, 3, 3]);
  });
  it('leaves a gap where fewer than 5 values are in the window', () => {
    expect(rollingMedian([0, 1, 2, 100, 101], [1, 2, 3, 4, 5])).toEqual([null, null, null, null, null]);
  });
});

describe('buildFaceTrend', () => {
  it(`needs ${MIN_COMPARABLE} comparable photos`, () => {
    expect(buildFaceTrend(album(MIN_COMPARABLE - 1))).toBeNull();
    expect(buildFaceTrend(album(MIN_COMPARABLE))).not.toBeNull();
  });

  it('skips unscanned, faceless and not-comparable photos', () => {
    const photos = album(120, { measure: (d) => (d % 3 === 0 ? null : d % 3 === 1 ? { yaw: 20 } : {}) });
    photos.push({ id: 'v1', date: iso(121) });
    const t = buildFaceTrend(photos)!;
    expect(t.points.map((p) => p.photoId)).toEqual(photos.filter((_, d) => d % 3 === 2).map((p) => p.id));
    expect(t.points.every((p) => Number.isFinite(p.value))).toBe(true);
    expect(comparableCount(photos)).toBe(40);
  });

  it('removes the closeness effect without flattening a slow real change', () => {
    // Real change: -8% over 300 days. Closeness wobbles day to day by up to ±10%.
    const photos = album(300, { index: (d) => 1.75 * (1 - 0.08 * d / 299), closeness: (d) => 0.2 * Math.exp(0.1 * Math.sin(d * 2.399)) });
    const t = buildFaceTrend(photos)!;
    expect(t.corrected).toBe(true);
    const sd = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + (x - xs.reduce((a, b) => a + b) / xs.length) ** 2, 0) / xs.length);
    const resid = t.points.filter((p) => p.trend !== null).map((p) => p.value / p.trend! - 1);
    expect(sd(resid)).toBeLessThan(0.0025); // wobble gone (was ~1%)
    const withTrend = t.points.filter((p) => p.trend !== null);
    const change = withTrend[withTrend.length - 1].trend! / withTrend[0].trend! - 1;
    expect(change).toBeCloseTo(-0.08 * (withTrend[withTrend.length - 1].day - withTrend[0].day) / 299, 2);
  });

  it('breaks the trend across a long gap instead of bridging it', () => {
    const photos = [...album(40), ...album(140).slice(100)]; // days 0-39, then 100-139
    const t = buildFaceTrend(photos)!;
    // Every photo has >= 5 neighbours within its own stretch, none across the 60-day gap.
    expect(t.points.filter((p) => p.trend !== null)).toHaveLength(80);
    expect(trendGeometry(t, 300, 100).line.match(/M/g)).toHaveLength(2);
  });
});

describe('faceHeadline', () => {
  it('compares now with 6 months ago', () => {
    // The drop happens inside the last 6 months, so "6 months ago" is before it.
    const t = buildFaceTrend(album(400, { index: (d) => (d < 300 ? 1.75 : 1.75 * 0.96) }))!;
    expect(faceHeadline(t)).toBe('lower face 4% thinner than 6 months ago');
  });
  it('compares with the start when the album is younger than 6 months', () => {
    const t = buildFaceTrend(album(100, { index: (d) => (d < 50 ? 1.75 : 1.75 * 1.03) }))!;
    expect(faceHeadline(t)).toBe('lower face 3% fuller since jan 1');
  });
  it('names the real reference date when a gap spans "6 months ago"', () => {
    // Photos on days 0-60 and 300-400: the nearest trend before "6 months ago" (day 218) is day 60.
    const photos = [...album(61), ...album(401, { index: () => 1.75 * 0.96 }).slice(300)];
    expect(faceHeadline(buildFaceTrend(photos)!)).toBe('lower face 4% thinner since mar 2');
  });
  it('says about the same as 6 months ago for a stable face', () => {
    expect(faceHeadline(buildFaceTrend(album(400))!)).toBe('lower face about the same as 6 months ago');
  });
  it('says about the same under 1%', () => {
    expect(faceHeadline(buildFaceTrend(album(100))!)).toBe('lower face about the same since jan 1');
  });
});

describe('photoReadout', () => {
  const photos = album(60, { index: (d) => (d === 30 ? 1.75 * 1.02 : 1.75), measure: (d) => (d === 40 ? { smile: 0.5 } : {}) });
  const t = buildFaceTrend(photos);
  it('compares a photo with the 30-day trend at its date', () => {
    expect(photoReadout(t, photos[30])).toBe('face 2% fuller than your 30-day average');
    expect(photoReadout(t, photos[31])).toBe('face about your 30-day average');
  });
  it('says why a photo is not comparable', () => {
    expect(photoReadout(t, photos[40])).toBe('not comparable: smiling');
  });
  it('says nothing for an unscanned photo', () => {
    expect(photoReadout(t, { id: 'x', date: iso(5) })).toBeNull();
  });
});

describe('compareDays / trendAt', () => {
  const photos = album(200, { index: (d) => (d < 100 ? 1.75 : 1.75 * 0.95) });
  const t = buildFaceTrend(photos)!;
  it('gives B vs A for the trend and for the two photos', () => {
    const r = compareDays(t, photos[20], photos[180]);
    expect(r.trend).toBeCloseTo(-5, 1);
    expect(r.photo).toBeCloseTo(-5, 1);
  });
  it('finds no trend far from any trend point', () => {
    expect(trendAt(t, iso(400))).toBeNull();
  });
});

describe('trendGeometry', () => {
  it('maps points into the box and breaks the line at gaps', () => {
    const photos = [...album(40), ...album(140).slice(100)];
    const g = trendGeometry(buildFaceTrend(photos)!, 300, 100);
    expect(g.dots.every((d) => d.x >= 0 && d.x <= 300 && d.y >= 0 && d.y <= 100)).toBe(true);
    expect(g.line.match(/M/g)!.length).toBe(2);
  });
});
