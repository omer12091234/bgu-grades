import { parseStringPromise } from "xml2js";
import type { Bin, TermDistribution, TermStats } from "@/types";
import { SUPPRESSION_THRESHOLD } from "@/types";

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

function zeroBins(): Bin[] {
  return CANONICAL_BINS.map((b) => ({ ...b, count: 0 }));
}

function computeStats(gradeMap: Map<number, number>, passingThreshold: number): TermStats {
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

function buildBins(gradeMap: Map<number, number>): Bin[] {
  const bins = zeroBins();
  for (const [grade, count] of gradeMap) {
    const idx = Math.max(0, Math.min(99, grade - 1));
    bins[idx].count += count;
  }
  return bins;
}

// Parse CF_2 which looks like:
// "2026/2 (ציון סופי לכלל הנבחנים)   קורס 361.1.1021 -מבוא להנדסת חשמל"
// Returns { semesterLabel, courseName }
function parseCF2(cf2: string): { semesterLabel: string; courseName: string } {
  // Semester label: "2026/2" at the start
  const semMatch = cf2.match(/^(\d{4}\/\d)/);
  const semesterLabel = semMatch ? semMatch[1] : "";

  // Course name: everything after the last " -" (dash with preceding space)
  const nameMatch = cf2.match(/ -([^-]+)$/);
  const courseName = nameMatch ? nameMatch[1].trim() : cf2.trim();

  return { semesterLabel, courseName };
}

// XML path: SCRR016W -> LIST_G_COURSE -> G_COURSE -> LIST_G_IN_DEPARTMENT -> G_IN_DEPARTMENT -> LIST_G_DATA -> G_DATA -> N9
export async function parseXmlResponse(
  xml: string,
  termId: string,
  year: number,
  semester: 1 | 2 | 3,
  passingThreshold = FAIL_THRESHOLD
): Promise<TermDistribution> {
  const label = termLabel(year, semester);
  const base = { termId, year, semester, label };
  const emptyBins = zeroBins();
  const emptyStats: TermStats = { mean: null, median: null, stdev: null, passRate: null, approximate: false };

  let parsed: Record<string, unknown>;
  try {
    const cleanXml = xml.replace(/<\?xml[^?]*\?>\s*/i, "");
    parsed = await parseStringPromise(cleanXml, { explicitArray: true, ignoreAttrs: true });
  } catch (e) {
    return { ...base, n: 0, bins: emptyBins, stats: emptyStats, status: "error", errorMessage: `XML parse failed: ${e}` };
  }

  const root = parsed["SCRR016W"] as Record<string, unknown> | undefined;
  if (!root) {
    return { ...base, n: 0, bins: emptyBins, stats: emptyStats, status: "empty" };
  }

  // Navigate to G_COURSE
  const listGCourse = (root["LIST_G_COURSE"] as Record<string, unknown>[])?.[0];
  const gCourse = (listGCourse?.["G_COURSE"] as Record<string, unknown>[])?.[0];

  // Extract course name and real semester label from CF_2
  let courseName: string | undefined;
  let realLabel = label; // fallback to computed label
  const cf2Raw = (gCourse?.["CF_2"] as string[])?.[0];
  if (cf2Raw) {
    const { semesterLabel, courseName: cn } = parseCF2(cf2Raw);
    courseName = cn;
    if (semesterLabel) realLabel = semesterLabel;
  }

  // Total average and stdev from Oracle (more accurate than recomputing from bins)
  const csAver = parseFloat((gCourse?.["CS_TOTAL_AVERAGE"] as string[])?.[0] ?? "");
  const csDev  = parseFloat((gCourse?.["CS_TOTAL_DEV"]     as string[])?.[0] ?? "");

  // Collect all G_IN_DEPARTMENT nodes
  let gInDepts: Record<string, unknown>[] = [];
  let departmentName: string | undefined;
  try {
    const listGInDept = (gCourse?.["LIST_G_IN_DEPARTMENT"] as Record<string, unknown>[])?.[0];
    gInDepts = (listGInDept?.["G_IN_DEPARTMENT"] as Record<string, unknown>[]) ?? [];
    // CF_1 is the department name — collect all unique ones
    const deptNames = gInDepts
      .map((d) => (d["CF_1"] as string[])?.[0])
      .filter(Boolean) as string[];
    if (deptNames.length > 0) departmentName = deptNames.join(", ");
  } catch { /* ignore */ }

  if (gInDepts.length === 0) {
    return { ...base, label: realLabel, courseName, departmentName, n: 0, bins: emptyBins, stats: emptyStats, status: "empty" };
  }

  // Aggregate individual grades (N9) across all departments
  const gradeMap = new Map<number, number>();
  for (const dept of gInDepts) {
    const listGData = (dept["LIST_G_DATA"] as Record<string, unknown>[])?.[0];
    const gDataArr = (listGData?.["G_DATA"] as Record<string, unknown>[]) ?? [];
    for (const gData of gDataArr) {
      const n9Val = (gData["N9"] as string[])?.[0];
      if (n9Val === undefined) continue;
      const grade = Number(n9Val);
      if (isNaN(grade)) continue;
      gradeMap.set(grade, (gradeMap.get(grade) ?? 0) + 1);
    }
  }

  const n = [...gradeMap.values()].reduce((s, c) => s + c, 0);

  if (n === 0) {
    return { ...base, label: realLabel, courseName, departmentName, n: 0, bins: emptyBins, stats: emptyStats, status: "empty" };
  }

  if (n < SUPPRESSION_THRESHOLD) {
    return {
      ...base, label: realLabel, courseName, departmentName, n,
      bins: emptyBins,
      raw: [...gradeMap.entries()].map(([grade, count]) => ({ grade, count })),
      stats: emptyStats,
      status: "suppressed",
    };
  }

  const bins = buildBins(gradeMap);

  // Use Oracle's pre-computed mean/stdev if available, otherwise compute from raw
  const computedStats = computeStats(gradeMap, passingThreshold);
  const stats: TermStats = {
    mean: !isNaN(csAver) ? csAver : computedStats.mean,
    median: computedStats.median,
    stdev: !isNaN(csDev) ? csDev : computedStats.stdev,
    passRate: computedStats.passRate,
    approximate: false,
  };

  const raw = [...gradeMap.entries()]
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => a.grade - b.grade);

  return { ...base, label: realLabel, courseName, departmentName, n, bins, raw, stats, status: "ok" };
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
