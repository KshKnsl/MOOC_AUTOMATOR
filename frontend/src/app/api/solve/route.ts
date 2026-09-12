import { solveQuestionsWithGemini } from "@/lib/gemini";
import { readJsonBody, sessionGeminiKey } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const apiKey = sessionGeminiKey(request, body) || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) {
    return Response.json({ error: "No Gemini API key provided. Add it in Settings." }, { status: 400 });
  }
  const result = await solveQuestionsWithGemini(
    apiKey,
    String(body.course_title || ""),
    String(body.quiz_title || ""),
    Array.isArray(body.questions) ? (body.questions as Array<Record<string, unknown>>) : [],
  );
  if (result.success) {
    return Response.json({ success: true, solutions: result.solutions });
  }
  return Response.json({ success: false, error: result.error }, { status: 500 });
}
