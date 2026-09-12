import { fetchNoteFile } from "@/lib/automator";
import { missingCookiesResponse, readJsonBody, sessionCookies } from "@/lib/session";
import type { NoteFetchItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const cookie = sessionCookies(request, body);
  if (!cookie) return missingCookiesResponse();
  const item = body.item as NoteFetchItem | undefined;
  if (!item?.filename || !item.url) {
    return Response.json({ error: "Note item is required" }, { status: 400 });
  }
  const file = await fetchNoteFile(cookie, item);
  if (!file) {
    return Response.json({ error: "Could not fetch that PDF." }, { status: 404 });
  }
  const filename = file.filename || item.filename;
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "X-Filename": encodeURIComponent(filename),
      "Cache-Control": "no-store",
    },
  });
}
