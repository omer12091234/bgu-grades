import { NextRequest, NextResponse } from "next/server";
import { fetchTerm, validateInput } from "@/lib/fetcher";
import { getLecturers } from "@/lib/catalog";
import { currentAcademicYear } from "@/lib/bgu-http";
import { isRateLimited } from "@/lib/rate-limit";
import type { TermResponse } from "@/types";

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

  const [term, lecturers] = await Promise.all([
    fetchTerm(dept, degree, course, year, semester),
    getLecturers(dept, degree, course, year, semester).catch(() => undefined),
  ]);
  const body: TermResponse = { ...term, lecturers };

  const finished = year < curYear;
  const cacheControl =
    term.status === "error"
      ? "no-store"
      : finished
        ? "public, s-maxage=604800, stale-while-revalidate=2592000"
        : "public, s-maxage=3600, stale-while-revalidate=86400";

  return NextResponse.json(body, { headers: { "Cache-Control": cacheControl } });
}
