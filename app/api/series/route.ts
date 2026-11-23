import { NextRequest, NextResponse } from "next/server";
import { fetchSeries } from "@/lib/fetcher";

// Simple in-memory rate limiter: max 10 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count++;
  return false;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = req.nextUrl;
  const dept   = searchParams.get("dept")     ?? "";
  const degree = searchParams.get("degree")   ?? "";
  const course = searchParams.get("course")   ?? "";
  const lookback = Number(searchParams.get("lookback") ?? "3");
  const semRaw   = searchParams.get("semester");
  const semesterFilter = semRaw ? Number(semRaw) : null;

  // Never accept P_FOR_STUDENT or p_key from clients — hardcoded off in fetcher
  if (!dept || !degree || !course) {
    return NextResponse.json({ error: "dept, degree, and course are required" }, { status: 400 });
  }

  try {
    const data = await fetchSeries(dept, degree, course, lookback, semesterFilter);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Invalid input")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
