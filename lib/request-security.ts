const buckets = new Map<string, { count: number; reset: number }>();
const failure = (message: string, status: number) => Object.assign(new Error(message), { status });
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) throw failure("Cross-site requests are not allowed", 403);
}
export async function readJsonBody(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw failure("JSON content type is required", 415);
  const limit = 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw failure("Request is too large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw failure("JSON body is required", 400);
  const decoder = new TextDecoder(); let size = 0, text = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw failure("Request is too large", 413); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try { const result = JSON.parse(text); if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error(); return result; }
  catch { throw failure("A JSON object is required", 400); }
}
export function sessionCookie(request: Request, token: string, maxAge: number) {
  return `clinic_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function throttleAuthentication(request: Request, action: string, email: string) {
  const time = Date.now(), window = 5 * 60 * 1000;
  if (buckets.size > 10000) for (const [key, value] of buckets) if (value.reset <= time) buckets.delete(key);
  if (buckets.size > 10000) throw failure("Please try again later", 429);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  for (const [key, maximum] of [[`ip:${ip}`, 60], [`account:${action}:${email.trim().toLowerCase()}:${ip}`, 5]] as const) {
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= time) { bucket = { count: 0, reset: time + window }; buckets.set(key, bucket); }
    if (++bucket.count > maximum) throw failure("Too many authentication attempts. Please try again later", 429);
  }
}
