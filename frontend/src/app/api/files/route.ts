export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ tree: [], stored: "browser" });
}
