/**
 * Face change over time for one album. Pure — no React, no native modules.
 *
 * Values are the face width index (lower-face width ÷ pupil distance) of comparable photos,
 * corrected for closeness and pitch with coefficients fitted on short-term variation only
 * (rolling medians removed first, so a slow real change can't be fitted away), then smoothed
 * with a 31-day centred rolling median.
 */
import type { FaceScan } from '@/types';
import { isComparable, notComparableReason, widthIndex } from '@/utils/faceMetrics';

export const MIN_COMPARABLE = 30;
const HALF_WINDOW = 15;
const MIN_IN_WINDOW = 5;
const SIX_MONTHS = 182;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export type TrendPhoto = { id: string; date: string; faceScan?: FaceScan };

export interface FacePoint {
  photoId: string;
  date: string;
  day: number;
  /** Corrected width index. */
  value: number;
  trend: number | null;
}

export interface FaceTrend {
  points: FacePoint[];
  /** Median corrected value: the 0% line. */
  median: number;
  corrected: boolean;
}

const dayOf = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86400000);
const monthDay = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median of values within ±15 days of each (sorted) day; null with fewer than 5 there. */
export function rollingMedian(days: number[], values: number[]): (number | null)[] {
  let lo = 0;
  let hi = 0;
  return days.map((d) => {
    while (days[lo] < d - HALF_WINDOW) lo++;
    while (hi < days.length && days[hi] <= d + HALF_WINDOW) hi++;
    return hi - lo >= MIN_IN_WINDOW ? median(values.slice(lo, hi)) : null;
  });
}

function comparablePhotos(photos: TrendPhoto[]) {
  return photos
    .filter((p) => p.faceScan?.measure && isComparable(p.faceScan.measure))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function comparableCount(photos: TrendPhoto[]): number {
  return comparablePhotos(photos).length;
}

/** OLS of value residuals on [ln-closeness residual, pitch residual]; clamped to plausible effects. */
function fitCorrection(days: number[], values: number[], lnClose: number[], pitch: number[]) {
  const res = (xs: number[]) => {
    const m = rollingMedian(days, xs);
    return xs.map((x, i) => (m[i] === null ? null : x - m[i]!));
  };
  const rv = res(values);
  const rc = res(lnClose);
  const rp = res(pitch);
  let scc = 0, spp = 0, scp = 0, scv = 0, spv = 0;
  for (let i = 0; i < values.length; i++) {
    if (rv[i] === null || rc[i] === null || rp[i] === null) continue;
    scc += rc[i]! * rc[i]!; spp += rp[i]! * rp[i]!; scp += rc[i]! * rp[i]!;
    scv += rc[i]! * rv[i]!; spv += rp[i]! * rv[i]!;
  }
  const det = scc * spp - scp * scp;
  let close = 0;
  let tilt = 0;
  if (Math.abs(det) > 1e-12) {
    close = (scv * spp - spv * scp) / det;
    tilt = (spv * scc - scv * scp) / det;
  } else if (scc > 1e-12) {
    close = scv / scc;
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const closePer10 = (close * Math.log(1.1)) / mean;
  if (!(closePer10 >= -0.04 && closePer10 <= 0)) close = 0;
  if (!(Math.abs(tilt / mean) <= 0.005)) tilt = 0;
  return { close, tilt };
}

export function buildFaceTrend(photos: TrendPhoto[]): FaceTrend | null {
  const rows = comparablePhotos(photos);
  if (rows.length < MIN_COMPARABLE) return null;
  const days = rows.map((p) => dayOf(p.date));
  const ms = rows.map((p) => p.faceScan!.measure!);
  const raw = ms.map(widthIndex);
  const lnClose = ms.map((m) => Math.log(m.closeness));
  const pitch = ms.map((m) => m.pitch);
  const { close, tilt } = fitCorrection(days, raw, lnClose, pitch);
  const meanC = lnClose.reduce((a, b) => a + b, 0) / lnClose.length;
  const meanP = pitch.reduce((a, b) => a + b, 0) / pitch.length;
  const values = raw.map((v, i) => v - close * (lnClose[i] - meanC) - tilt * (pitch[i] - meanP));
  const trend = rollingMedian(days, values);
  return {
    points: rows.map((p, i) => ({ photoId: p.id, date: p.date, day: days[i], value: values[i], trend: trend[i] })),
    median: median(values),
    corrected: close !== 0 || tilt !== 0,
  };
}

/** Trend at a date: the nearest trend point within 15 days. */
export function trendAt(t: FaceTrend, date: string): number | null {
  const d = dayOf(date);
  let best: number | null = null;
  let bestGap = HALF_WINDOW + 1;
  for (const p of t.points) {
    const gap = Math.abs(p.day - d);
    if (p.trend !== null && gap < bestGap) {
      best = p.trend;
      bestGap = gap;
    }
  }
  return best;
}

const pctText = (pct: number, more: string, less: string) => `${Math.round(Math.abs(pct))}% ${pct > 0 ? more : less}`;

export function faceHeadline(t: FaceTrend): string | null {
  const pts = t.points.filter((p) => p.trend !== null);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const sixMonths = last.day - pts[0].day >= SIX_MONTHS;
  const ref = sixMonths ? pts.find((p) => p.day >= last.day - SIX_MONTHS)! : pts[0];
  const pct = (last.trend! / ref.trend! - 1) * 100;
  const since = sixMonths ? 'than 6 months ago' : `since ${monthDay(ref.date)}`;
  if (Math.abs(pct) < 1) return `lower face about the same ${since}`;
  return `lower face ${pctText(pct, 'fuller', 'thinner')} ${since}`;
}

export function photoReadout(t: FaceTrend | null, photo: TrendPhoto): string | null {
  const m = photo.faceScan?.measure;
  if (!m) return null;
  const reason = notComparableReason(m);
  if (reason) return `not comparable: ${reason}`;
  const p = t?.points.find((q) => q.photoId === photo.id);
  if (!p || p.trend === null) return null;
  const pct = (p.value / p.trend - 1) * 100;
  if (Math.abs(pct) < 1) return 'face about your 30-day average';
  return `face ${pctText(pct, 'fuller', 'thinner')} than your 30-day average`;
}

/** Percent change from A to B: of the trend at their dates, and of the two photos themselves. */
export function compareDays(t: FaceTrend, a: TrendPhoto, b: TrendPhoto): { trend: number | null; photo: number | null } {
  const ta = trendAt(t, a.date);
  const tb = trendAt(t, b.date);
  const pa = t.points.find((p) => p.photoId === a.id)?.value;
  const pb = t.points.find((p) => p.photoId === b.id)?.value;
  return {
    trend: ta !== null && tb !== null ? (tb / ta - 1) * 100 : null,
    photo: pa !== undefined && pb !== undefined ? (pb / pa - 1) * 100 : null,
  };
}

/** Chart geometry in a w×h box: dots for photos, an SVG path for the trend broken at gaps. */
export function trendGeometry(t: FaceTrend, w: number, h: number) {
  const pct = (v: number) => (v / t.median - 1) * 100;
  const vals = t.points.map((p) => pct(p.value)).sort((a, b) => a - b);
  const trends = t.points.filter((p) => p.trend !== null).map((p) => pct(p.trend!));
  const lo = Math.min(vals[Math.floor(vals.length * 0.02)], ...trends, -2);
  const hi = Math.max(vals[Math.ceil(vals.length * 0.98) - 1], ...trends, 2);
  const d0 = t.points[0].day;
  const span = Math.max(1, t.points[t.points.length - 1].day - d0);
  const x = (day: number) => ((day - d0) / span) * w;
  const y = (p: number) => h - ((Math.min(hi, Math.max(lo, p)) - lo) / (hi - lo)) * h;
  let line = '';
  let prev: number | null = null;
  for (const p of t.points) {
    if (p.trend === null) { prev = null; continue; }
    const cmd = prev === null || p.day - prev > 2 * HALF_WINDOW ? 'M' : 'L';
    line += `${cmd}${x(p.day).toFixed(1)},${y(pct(p.trend)).toFixed(1)}`;
    prev = p.day;
  }
  return { dots: t.points.map((p) => ({ x: x(p.day), y: y(pct(p.value)), photoId: p.photoId, date: p.date })), line };
}
