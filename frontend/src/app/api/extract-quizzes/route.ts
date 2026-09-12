import { extractCourseQuizzes } from "@/lib/automator";
import { missingCookiesResponse, readJsonBody, sessionCookies } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const cookie = sessionCookies(request, body);
  if (!cookie) return missingCookiesResponse();
  const courseId = String(body.course_id || "");
  if (!courseId) {
    return Response.json({ error: "course_id is required" }, { status: 400 });
  }
  const { quizzes, solutions_markdown } = await extractCourseQuizzes(cookie, courseId);
  return Response.json({ success: true, quizzes, solutions_markdown });
}
