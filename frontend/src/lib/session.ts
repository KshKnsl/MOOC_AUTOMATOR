export function sessionCookies(request: Request, body?: Record<string, unknown>): string {
  const fromHeader = request.headers.get("x-session-cookies") || "";
  const fromBody = typeof body?.cookies === "string" ? body.cookies : "";
  return (fromHeader || fromBody).trim();
}

export function missingCookiesResponse(): Response {
  return Response.json(
    { error: "Session cookies missing. Add them in Settings — they stay in this browser only." },
    { status: 401 },
  );
}

export function sessionGeminiKey(request: Request, body?: Record<string, unknown>): string {
  const fromHeader = request.headers.get("x-gemini-key") || "";
  const fromBody = typeof body?.gemini_key === "string" ? body.gemini_key : "";
  return (fromHeader || fromBody).trim();
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
