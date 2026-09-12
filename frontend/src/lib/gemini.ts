const MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash-lite"];

async function callGeminiApi(apiKey: string, prompt: string, model: string): Promise<[boolean, string]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (NPTEL-Automator)",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return [false, `HTTP ${response.status}: ${JSON.stringify(data)}`];
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) return [false, "No candidates returned from Gemini."];
    return [true, text];
  } catch (error) {
    return [false, error instanceof Error ? error.message : String(error)];
  }
}

export async function solveQuestionsWithGemini(
  apiKey: string,
  courseTitle: string,
  quizTitle: string,
  questions: Array<Record<string, unknown>>,
): Promise<{ success: boolean; solutions?: unknown; error?: string }> {
  if (!apiKey) return { success: false, error: "No Gemini API key provided." };

  const questionsRepr = questions.map((question) => ({
    q_num: question.q_num ?? 1,
    question_id: question.question_block_id ?? "",
    question_text: question.question_text ?? "",
    input_type: question.input_type ?? "radio",
    multiple_selections: question.multiple_selections ?? false,
    choices: Array.isArray(question.choices)
      ? (question.choices as Array<Record<string, unknown>>).map((choice) => ({
          choice_id: choice.choice_id,
          text: choice.text,
        }))
      : [],
  }));

  const prompt = `You are an elite academic professor and expert tutor solving an assignment for the NPTEL / Swayam course: "${courseTitle}".
Assignment Title: "${quizTitle}"

Carefully analyze each question below and select the single best or correct choice(s).
For each question:
1. Provide the exact 0-based choice index (\`selected_choice_index\`, e.g. 0, 1, 2, 3).
2. Provide the \`selected_choice_id\` matching the choice_id in the input.
3. Provide the \`selected_choice_text\`.
4. Provide concise scientific/conceptual \`reasoning\` justifying why this option is correct.

Questions:
${JSON.stringify(questionsRepr, null, 2)}

Respond with a JSON object strictly following this schema:
{
  "solutions": [
    {
      "q_num": 1,
      "question_id": "...",
      "selected_choice_index": 1,
      "selected_choice_id": "1",
      "selected_choice_text": "...",
      "reasoning": "..."
    }
  ]
}
`;

  let lastError = "";
  for (const model of MODELS) {
    const [ok, resultText] = await callGeminiApi(apiKey, prompt, model);
    if (ok && resultText) {
      try {
        const parsed = JSON.parse(resultText);
        if (Array.isArray(parsed?.solutions)) {
          return { success: true, solutions: parsed.solutions };
        }
      } catch (error) {
        lastError = `JSON parse error on model ${model}: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else {
      lastError = resultText;
    }
  }

  return { success: false, error: `Gemini solving failed: ${lastError}` };
}
