// Fetches one term's grade distribution from BGU's Oracle Reports servlet (SCRR016w).
import { unstable_cache } from "next/cache";
import { parseXmlResponse } from "./parser";
import { termLabel, zeroBins } from "./stats";
import type { TermDistribution } from "@/types";
import { currentAcademicYear, decodeCp1255, delay } from "./bgu-http";

const BGU_URL = "https://reports4u22.bgu.ac.il/reports/rwservlet";
const DAY = 24 * 60 * 60;

export function validateInput(value: string): boolean {
  return /^\d{1,6}$/.test(value);
}

/**
 * Which students the report covers ("grade" parameter of SCRR016w):
 * 5 = final grade of everyone, 1 = students who sat מועד א׳, 2 = מועד ב׳,
 * 3 = the remaining exam session (the report leaves its label blank; by the data it is מועד מיוחד).
 */
export const EXAM_GRADE = { final: "5", a: "1", b: "2", special: "3" } as const;
export type Exam = keyof typeof EXAM_GRADE;

async function fetchTermXml(dept: string, degree: string, course: string, year: number, semester: number, exam: Exam) {
  const params = new URLSearchParams({
    server: "aristo4stu419c",
    report: "SCRR016w",
    p_year: String(year),
    p_semester: String(semester),
    out_institution: "0",
    grade: EXAM_GRADE[exam],
    list_department: `*${dept}@`,
    list_degree_level: `*${degree}@`,
    list_course: `*${course}@`,
    LIST_GROUP: "*@",
    envid: "AM",
    cmdkey: "prod",
    destype: "cache",
    desformat: "xml",
    accessible: "yes",
  });

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await delay(1000 * attempt);
    try {
      const res = await fetch(`${BGU_URL}?${params}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        if (res.status < 500) break; // don't retry 4xx
        continue;
      }
      return decodeCp1255(await res.arrayBuffer());
    } catch (e) {
      lastError = String(e);
    }
  }
  // Throwing keeps failures out of the cache.
  throw new Error(lastError || "No response");
}

async function fetchTermUncached(
  dept: string,
  degree: string,
  course: string,
  year: number,
  semester: number,
  exam: Exam
): Promise<TermDistribution> {
  const xml = await fetchTermXml(dept, degree, course, year, semester, exam);
  return parseXmlResponse(xml, `${year}-${semester}`, year, semester as 1 | 2 | 3);
}

/**
 * Grades of a finished academic year are final, so they're cached for 30 days.
 * The current year can still receive grades (appeals, מועד ב׳), so it refreshes every 6 hours.
 * unstable_cache persists in Vercel's data cache, shared by all serverless instances.
 */
export async function fetchTerm(
  dept: string,
  degree: string,
  course: string,
  year: number,
  semester: number,
  exam: Exam = "final"
): Promise<TermDistribution> {
  if (![dept, degree, course].every(validateInput)) {
    throw new Error("Invalid input: dept, degree, and course must be numeric (up to 6 digits)");
  }
  const isCurrent = year >= currentAcademicYear();
  const cached = unstable_cache(fetchTermUncached, ["bgu-term-v3"], {
    revalidate: isCurrent ? 6 * 60 * 60 : 30 * DAY,
  });
  try {
    return await cached(dept, degree, course, year, semester, exam);
  } catch (e) {
    return {
      termId: `${year}-${semester}`,
      year,
      semester: semester as 1 | 2 | 3,
      label: termLabel(year, semester),
      n: 0,
      bins: zeroBins(),
      stats: { mean: null, median: null, stdev: null, passRate: null, approximate: false },
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}
