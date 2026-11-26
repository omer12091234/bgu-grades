import { NextRequest, NextResponse } from "next/server";
import { searchCourses } from "@/lib/catalog";
import { isRateLimited } from "@/lib/rate-limit";

const MAX_RESULTS = 40;

// GET /api/courses?q=מבוא להנדסת
export async function GET(req: NextRequest) {
  if (isRateLimited(req, "courses", 60)) {
    return NextResponse.json({ error: "יותר מדי בקשות, נסו שוב בעוד דקה" }, { status: 429 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 60) {
    return NextResponse.json({ error: "q must be 2–60 characters" }, { status: 400 });
  }

  try {
    const all = await searchCourses(q);
    return NextResponse.json(
      { query: q, total: all.length, results: all.slice(0, MAX_RESULTS) },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
    );
  } catch {
    return NextResponse.json({ error: "החיפוש לא זמין כרגע, נסו שוב בעוד רגע" }, { status: 502 });
  }
}
