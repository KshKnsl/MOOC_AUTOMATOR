"use client";

import { getCookieHeader, getGeminiKeyLocal } from "@/lib/client-store";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookies = getCookieHeader();
  const gemini = getGeminiKeyLocal();
  if (cookies) headers.set("x-session-cookies", cookies);
  if (gemini) headers.set("x-gemini-key", gemini);

  const method = (init.method || "GET").toUpperCase();
  let body = init.body;
  if (method !== "GET" && method !== "HEAD") {
    let payload: Record<string, unknown> = {};
    if (typeof body === "string" && body) {
      try {
        const parsed = JSON.parse(body) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          payload = parsed as Record<string, unknown>;
        }
      } catch {
        payload = {};
      }
    }
    if (cookies && payload.cookies == null) payload.cookies = cookies;
    if (gemini && payload.gemini_key == null) payload.gemini_key = gemini;
    body = JSON.stringify(payload);
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, { ...init, headers, body });
}
