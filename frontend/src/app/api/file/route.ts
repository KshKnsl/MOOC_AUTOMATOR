export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ error: "Files are stored in this browser, not on the server." }, { status: 404 });
}
