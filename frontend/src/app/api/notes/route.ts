export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ notes: [], stored: "browser" });
}
