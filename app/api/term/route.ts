import { NextRequest, NextResponse } from "next/server";
import { fetchTerm, validateInput } from "@/lib/fetcher";
import { getLecturers } from "@/lib/catalog";
import { currentAcademicYear } from "@/lib/bgu-http";
import { isRateLimited } from "@/lib/rate-limit";
import type { TermResponse } from "@/types";

/**
 * Renumbered departments. Courses that moved from department 201 to 212 in academic
 * year 2026 kept their course numbers, so a 212 course's grades before 2026 are filed
 * under 201 (e.g. 212.1.2361 was 201.1.2361), and the other way round.
 */
function formerDept(dept: string, year: number): string | null {
  if (dept === "212" && year <= 2025) return "201";
  if (dept === "201" && year >= 2026) return "212";
  return null;
}

// GET /api/term?dept=361&degree=1&course=2251&year=2025&semester=1
// One semester per request, so the browser can show progress and the CDN caches each term on its own.
export async function GET(req: NextRequest) {
  if (isRateLimited(req, "term", 120)) {
    return NextResponse.json({ error: "יותר מדי בקשות, נסו שוב בעוד דקה" }, { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const dept = sp.get("dept") ?? "";
  const degree = sp.get("degree") ?? "";
  const course = sp.get("course") ?? "";
  const year = Number(sp.get("year"));
  const semester = Number(sp.get("semester"));

  // P_FOR_STUDENT / p_key are never accepted from clients.
  if (![dept, degree, course].every(validateInput)) {
    return NextResponse.json({ error: "dept, degree and course must be numeric" }, { status: 400 });
  }
  const curYear = currentAcademicYear();
  if (!Number.isInteger(year) || year < curYear - 10 || year > curYear || ![1, 2, 3].includes(semester)) {
    return NextResponse.json({ error: "invalid year or semester" }, { status: 400 });
  }

  const lecturersP = getLecturers(dept, degree, course, year, semester).catch(() => undefined);
  let term = await fetchTerm(dept, degree, course, year, semester);
  let usedDept = dept;
  let sourceNumber: string | undefined;
  const alias = formerDept(dept, year);
  if (alias && term.status === "empty") {
    const aliased = await fetchTerm(alias, degree, course, year, semester);
    if (aliased.status === "ok" || aliased.status === "suppressed") {
      term = aliased;
      usedDept = alias;
      sourceNumber = `${alias.padStart(3, "0")}.${degree}.${course.padStart(4, "0")}`;
    }
  }
  const lecturers =
    usedDept === dept ? await lecturersP : await getLecturers(usedDept, degree, course, year, semester).catch(() => undefined);
  const body: TermResponse = { ...term, lecturers, sourceNumber };

  const finished = year < curYear;
  const cacheControl =
    term.status === "error"
      ? "no-store"
      : finished
        ? "public, s-maxage=604800, stale-while-revalidate=2592000"
        : "public, s-maxage=3600, stale-while-revalidate=86400";

  return NextResponse.json(body, { headers: { "Cache-Control": cacheControl } });
}
