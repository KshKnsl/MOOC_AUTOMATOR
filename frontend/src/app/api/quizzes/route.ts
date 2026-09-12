export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ quizzes: [], solutions_markdown: "", stored: "browser" });
}
