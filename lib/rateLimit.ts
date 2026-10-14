// In-memory sliding window. Fine for a demo; each serverless instance has its
// own memory, so production would use a shared store like Upstash Redis.
const hits = new Map<string, number[]>();

export function isRateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export function getIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}