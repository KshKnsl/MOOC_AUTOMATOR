import { scanAssignments } from "@/lib/automator";
import { missingCookiesResponse, readJsonBody, sessionCookies } from "@/lib/session";
import type { Course } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const cookie = sessionCookies(request, body);
  if (!cookie) return missingCookiesResponse();
  const courses = Array.isArray(body.courses) ? (body.courses as Course[]) : [];
  const courseId = typeof body.course_id === "string" ? body.course_id : null;
  const { unsubmitted, all } = await scanAssignments(cookie, courses, courseId);
  return Response.json({ unsubmitted, all });
}
