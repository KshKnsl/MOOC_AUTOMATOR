import { readJsonBody } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const key = String(body.key || "").trim();
  if (!key) return Response.json({ error: "Invalid API key" }, { status: 400 });
  return Response.json({ success: true, stored: "browser" });
}
