import type { Bin, TermDistribution, TermStats } from "@/types";

export const FAIL_THRESHOLD = 56; // grades below this are failing

// One bin per grade value 1-100
export const CANONICAL_BINS: Omit<Bin, "count">[] = Array.from({ length: 100 }, (_, i) => ({
  label: String(i + 1),
  min: i + 1,
  max: i + 1,
}));

const SEMESTER_LABELS: Record<number, string> = { 1: "א׳", 2: "ב׳", 3: "ג׳" };

export function termLabel(year: number, semester: number): string {
  return `${SEMESTER_LABELS[semester] ?? semester} ${year}`;
}

export function zeroBins(): Bin[] {
  return CANONICAL_BINS.map((b) => ({ ...b, count: 0 }));
}

export function computeStats(gradeMap: Map<number, number>, passingThreshold: number): TermStats {
  const total = [...gradeMap.values()].reduce((s, c) => s + c, 0);
  if (total === 0)
    return { mean: null, median: null, stdev: null, passRate: null, approximate: false };

  const expanded: number[] = [];
  for (const [grade, count] of gradeMap) {
    for (let i = 0; i < count; i++) expanded.push(grade);
  }
  expanded.sort((a, b) => a - b);

  const mean = expanded.reduce((s, g) => s + g, 0) / total;
  const median =
    total % 2 === 0
      ? (expanded[total / 2 - 1] + expanded[total / 2]) / 2
      : expanded[Math.floor(total / 2)];
  const variance = expanded.reduce((s, g) => s + (g - mean) ** 2, 0) / total;
  const stdev = Math.sqrt(variance);
  const passRate = expanded.filter((g) => g >= passingThreshold).length / total;

  return { mean, median, stdev, passRate, approximate: false };
}

export function buildBins(gradeMap: Map<number, number>): Bin[] {
  const bins = zeroBins();
  for (const [grade, count] of gradeMap) {
    const idx = Math.max(0, Math.min(99, grade - 1));
    bins[idx].count += count;
  }
  return bins;
}

export function combinedDistribution(terms: TermDistribution[]): TermDistribution {
  const okTerms = terms.filter((t) => t.status === "ok");
  const bins = zeroBins();
  let totalN = 0;

  for (const term of okTerms) {
    totalN += term.n;
    for (let i = 0; i < bins.length; i++) {
      bins[i].count += term.bins[i].count;
    }
  }

  const pooledMap = new Map<number, number>();
  for (const term of okTerms) {
    for (const { grade, count } of term.raw ?? []) {
      pooledMap.set(grade, (pooledMap.get(grade) ?? 0) + count);
    }
  }

  const hasRaw = okTerms.every((t) => t.raw && t.raw.length > 0);
  const stats = hasRaw && pooledMap.size > 0
    ? computeStats(pooledMap, FAIL_THRESHOLD)
    : { mean: null, median: null, stdev: null, passRate: null, approximate: true };

  return {
    termId: "combined",
    year: 0,
    semester: 1,
    label: "כל הסמסטרים",
    courseName: okTerms[0]?.courseName,
    departmentName: okTerms[0]?.departmentName,
    n: totalN,
    bins,
    raw: hasRaw ? [...pooledMap.entries()].map(([grade, count]) => ({ grade, count })) : undefined,
    stats,
    status: totalN === 0 ? "empty" : "ok",
  };
}

// ── Helpers for comparison and trend views ───────────────────────────────────

export const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "\u200E0–39\u200E", min: 0, max: 39 },
  ...Array.from({ length: 11 }, (_, i) => {
    const min = 40 + i * 5;
    const max = i === 10 ? 100 : min + 4;
    // LRM marks keep "40–44" from being flipped by the RTL canvas.
    return { label: `\u200E${min}–${max}\u200E`, min, max };
  }),
];

/** Share of students (0–1) per 5-point bucket, so courses of different sizes are comparable. */
export function bucketShares(term: TermDistribution): number[] {
  const total = term.bins.reduce((s, b) => s + b.count, 0);
  return BUCKETS.map((bk) => {
    if (total === 0) return 0;
    let c = 0;
    for (const b of term.bins) if (b.min >= bk.min && b.min <= bk.max) c += b.count;
    return c / total;
  });
}

export function lecturerKey(t: TermDistribution): string {
  return t.lecturers && t.lecturers.length > 0 ? [...t.lecturers].sort().join(", ") : "";
}

export type LecturerSummary = {
  lecturer: string;
  terms: TermDistribution[];
  combined: TermDistribution;
};

/** Pools the grades of every semester taught by the same lecturer(s). */
export function summariseByLecturer(terms: TermDistribution[]): LecturerSummary[] {
  const groups = new Map<string, TermDistribution[]>();
  for (const t of terms) {
    if (t.status !== "ok") continue;
    const k = lecturerKey(t) || "לא ידוע";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  return [...groups.entries()]
    .map(([lecturer, ts]) => ({ lecturer, terms: ts, combined: combinedDistribution(ts) }))
    .sort((a, b) => b.terms[0].year * 10 + b.terms[0].semester - (a.terms[0].year * 10 + a.terms[0].semester));
}
