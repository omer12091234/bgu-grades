// Client for BGU's public course catalog ("קובץ הקורסים", bgu4u.bgu.ac.il).
// Used for course-name search and for the lecturers of each semester.
import { unstable_cache } from "next/cache";
import type { CourseSearchResult } from "@/types";
import { cleanText, currentAcademicYear, decodeCp1255, formBody } from "./bgu-http";

const CATALOG_URL = "https://bgu4u.bgu.ac.il/pls/scwp/!sc.AnnualCoursesAdv";

const DAY = 24 * 60 * 60;

async function postCatalog(fields: Record<string, string>): Promise<string> {
  const res = await fetch(CATALOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(fields),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);
  return decodeCp1255(await res.arrayBuffer());
}

// ── Course name search ──────────────────────────────────────────────────────

// The search form is mod_plsql: every parameter must be present or it 404s.
function searchFields(name: string, year: number): Record<string, string> {
  return {
    oc_course_name: name,
    on_course_lins: "",
    on_course_ins: "0",
    on_course_ldepartment: "",
    on_course_department: "",
    on_course_ldegree_level: "",
    on_course_degree_level: "",
    on_course: "",
    on_semester: "",
    on_year: String(year),
    on_hours: "",
    on_credit_points: "",
    oc_lecturer_first_name: "",
    oc_lecturer_last_name: "",
    oc_end_time: "",
    oc_start_time: "",
    on_campus: "",
    step: "1",
    type: "new",
  };
}

export function parseSearchResults(html: string): CourseSearchResult[] {
  const results: CourseSearchResult[] = [];
  const rows = html.split(/<tr>/i).slice(1);
  for (const row of rows) {
    const link = row.match(/goCourseDetails\('(\d+)','(\d+)','(\d+)'[^)]*\)">([\s\S]*?)<\/a>/);
    if (!link) continue;
    const [, dept, degree, course, nameHtml] = link;
    const en = row.match(/class="BlackTextEng"[^>]*>([\s\S]*?)<\/td>/i);
    const last = row.match(/class="BlackTextCenter"[^>]*>([\s\S]*?)<\/td>/i);
    results.push({
      dept: String(Number(dept)),
      degree: String(Number(degree)),
      course: String(Number(course)),
      number: `${dept.padStart(3, "0")}.${degree}.${course.padStart(4, "0")}`,
      nameHe: cleanText(nameHtml),
      nameEn: en ? cleanText(en[1]) : "",
      lastActive: last ? cleanText(last[1]) : "",
    });
  }
  return results;
}

async function searchYear(name: string, year: number): Promise<CourseSearchResult[]> {
  return parseSearchResults(await postCatalog(searchFields(name, year)));
}

/**
 * Search courses by (part of) their Hebrew name. The catalog requires a year,
 * so we search the current and previous academic year and merge — that covers
 * courses that haven't opened yet this year.
 */
async function searchCoursesUncached(query: string): Promise<CourseSearchResult[]> {
  const year = currentAcademicYear();
  const settled = await Promise.allSettled([searchYear(query, year), searchYear(query, year - 1)]);
  const ok = settled.filter((s) => s.status === "fulfilled");
  if (ok.length === 0) throw new Error("Catalog search failed");

  const byNumber = new Map<string, CourseSearchResult>();
  for (const s of ok) {
    for (const r of (s as PromiseFulfilledResult<CourseSearchResult[]>).value) {
      const prev = byNumber.get(r.number);
      if (!prev || r.lastActive > prev.lastActive) byNumber.set(r.number, r);
    }
  }

  const q = query.trim();
  const score = (r: CourseSearchResult) =>
    r.nameHe === q ? 0 : r.nameHe.startsWith(q) ? 1 : r.nameHe.includes(q) ? 2 : 3;
  return [...byNumber.values()].sort(
    (a, b) => score(a) - score(b) || b.lastActive.localeCompare(a.lastActive) || a.nameHe.length - b.nameHe.length
  );
}

/** Cached for a day in Next's data cache (persists across serverless instances on Vercel). */
export const searchCourses = unstable_cache(searchCoursesUncached, ["catalog-search-v1"], {
  revalidate: DAY,
});

// ── Lecturers per semester ──────────────────────────────────────────────────

export function parseLecturers(html: string): string[] {
  const names = new Set<string>();
  const rows = html.split(/<tr>/i).slice(1);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*valign="top"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanText(m[1]));
    // Columns: place, time, lecturer, group, type
    if (cells.length < 5) continue;
    const type = cells[cells.length - 1];
    if (type !== "שעור" && type !== "שיעור") continue;
    for (const name of cells[2].split(/\n|,/)) {
      const n = name.trim();
      if (n) names.add(n);
    }
  }
  return [...names];
}

async function getLecturersUncached(
  dept: string,
  degree: string,
  course: string,
  year: number,
  semester: number
): Promise<string[]> {
  const html = await postCatalog({
    rn_course: course,
    rn_course_department: dept,
    rn_course_degree_level: degree,
    rn_year: String(year),
    rn_semester: String(semester),
    rn_institution: "0",
    rn_course_details: "",
    step: "3",
    type: "",
  });
  return parseLecturers(html);
}

/** Lecturers of a past semester never change; the current year is refreshed weekly. */
export async function getLecturers(
  dept: string,
  degree: string,
  course: string,
  year: number,
  semester: number
): Promise<string[]> {
  const isCurrent = year >= currentAcademicYear();
  const cached = unstable_cache(getLecturersUncached, ["catalog-lecturers-v1"], {
    revalidate: isCurrent ? 7 * DAY : 180 * DAY,
  });
  return cached(dept, degree, course, year, semester);
}
