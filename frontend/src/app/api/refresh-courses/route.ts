import { fetchEnrolledCourses } from "@/lib/automator";
import { missingCookiesResponse, sessionCookies } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const cookie = sessionCookies(request);
  if (!cookie) return missingCookiesResponse();
  const courses = await fetchEnrolledCourses(cookie);
  return Response.json({ success: true, courses });
}
