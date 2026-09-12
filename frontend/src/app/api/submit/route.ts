import { submitAssessmentAnswers } from "@/lib/automator";
import { missingCookiesResponse, readJsonBody, sessionCookies } from "@/lib/session";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const cookie = sessionCookies(request, body);
  if (!cookie) return missingCookiesResponse();
  const result = await submitAssessmentAnswers(
    cookie,
    String(body.course_id || ""),
    body.unit_id,
    body.assessment_id,
    String(body.xsrf_token || ""),
    Array.isArray(body.questions) ? (body.questions as Question[]) : [],
    body.selected_answers && typeof body.selected_answers === "object"
      ? (body.selected_answers as Record<string, string>)
      : {},
  );
  return Response.json({ success: result.success, message: result.message });
}
