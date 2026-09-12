import { readJsonBody } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const cookies = String(body.cookies || "").trim();
  return Response.json({ success: Boolean(cookies), stored: "browser" }, { status: cookies ? 200 : 400 });
}
