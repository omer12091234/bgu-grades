import type { NextRequest } from "next/server";

// Best-effort per-instance limiter. On serverless each instance has its own map,
// so this only stops bursts; the CDN cache in front of the API absorbs repeat traffic.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(req: NextRequest, scope: string, limitPerMinute: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > limitPerMinute;
}
