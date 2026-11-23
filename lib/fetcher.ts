import { parseXmlResponse, combinedDistribution, termLabel } from "./parser";
// Note: combinedDistribution and termLabel are re-exported from parser.ts
import type { TermDistribution, SeriesResponse } from "@/types";

const BGU_URL = "https://reports4u22.bgu.ac.il/reports/rwservlet";
const CACHE = new Map<string, { data: TermDistribution; fetchedAt: number }>();
const COMPLETED_TERM_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days
const CURRENT_TERM_TTL   =  1 * 60 * 60 * 1000;        // 1 hour
const SEQUENTIAL_DELAY   = 500;  // ms between upstream calls

function listParam(code: string): string {
  return `*${code}@`;
}

function currentAcademicYear(): number {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

function isCurrentTerm(year: number, semester: number): boolean {
  const curYear = currentAcademicYear();
  return year === curYear;
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchOneTerm(
  dept: string,
  degree: string,
  course: string,
  year: number,
  semester: number
): Promise<TermDistribution> {
  const termId = `${year}-${semester}`;
  const cacheKey = `${dept}:${degree}:${course}:${termId}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  const ttl = isCurrentTerm(year, semester) ? CURRENT_TERM_TTL : COMPLETED_TERM_TTL;

  if (cached && now - cached.fetchedAt < ttl) {
    return cached.data;
  }

  const params = new URLSearchParams({
    server: "aristo4stu419c",
    report: "SCRR016w",
    p_year: String(year),
    p_semester: String(semester),
    out_institution: "0",
    grade: "5",
    list_department: listParam(dept),
    list_degree_level: listParam(degree),
    list_course: listParam(course),
    LIST_GROUP: "*@",
    envid: "AM",
    cmdkey: "prod",
    destype: "cache",
    desformat: "xml",
    accessible: "yes",
  });

  const url = `${BGU_URL}?${params.toString()}`;

  let xml = "";
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await delay(1000 * attempt);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) break; // don't retry 4xx
        lastError = `HTTP ${res.status}`;
        continue;
      }
      // BGU servlet returns Windows-1255 (Hebrew); decode the raw buffer explicitly
      const buf = await res.arrayBuffer();
      xml = new TextDecoder("windows-1255").decode(buf);
      break;
    } catch (e) {
      lastError = String(e);
    }
  }

  const dist = xml
    ? await parseXmlResponse(xml, termId, year, semester as 1 | 2 | 3)
    : {
        termId,
        year,
        semester: semester as 1 | 2 | 3,
        label: termLabel(year, semester),
        n: 0,
        bins: Array.from({ length: 10 }, (_, i) => ({ label: "", min: 0, max: 0, count: 0 })),
        stats: { mean: null, median: null, stdev: null, passRate: null, approximate: false },
        status: "error" as const,
        errorMessage: lastError || "No response",
      };

  CACHE.set(cacheKey, { data: dist, fetchedAt: now });
  return dist;
}

export function validateInput(value: string): boolean {
  return /^\d{1,6}$/.test(value);
}

export async function fetchSeries(
  dept: string,
  degree: string,
  course: string,
  lookback: number,
  semesterFilter: number | null
): Promise<SeriesResponse> {
  if (!validateInput(dept) || !validateInput(degree) || !validateInput(course)) {
    throw new Error("Invalid input: dept, degree, and course must be numeric (up to 6 digits)");
  }
  if (lookback < 1 || lookback > 5) throw new Error("lookback must be 1–5");

  const curYear = currentAcademicYear();
  const years = Array.from({ length: lookback }, (_, i) => curYear - i);
  const semesters = semesterFilter ? [semesterFilter] : [1, 2];

  const terms: TermDistribution[] = [];
  const failures: { termId: string; reason: string }[] = [];

  for (const year of years) {
    for (const sem of semesters) {
      if (terms.length > 0 || failures.length > 0) await delay(SEQUENTIAL_DELAY);
      try {
        const dist = await fetchOneTerm(dept, degree, course, year, sem);
        terms.push(dist);
        if (dist.status === "error") {
          failures.push({ termId: dist.termId, reason: dist.errorMessage ?? "unknown" });
        }
      } catch (e) {
        const termId = `${year}-${sem}`;
        failures.push({ termId, reason: String(e) });
      }
    }
  }

  const combined = combinedDistribution(terms);

  return {
    terms,
    combined,
    meta: {
      dept, degree, course, lookback,
      semesterFilter,
      fetchedAt: new Date().toISOString(),
      failures,
    },
  };
}
