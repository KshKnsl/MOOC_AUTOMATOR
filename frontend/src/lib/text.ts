export function sanitizeFilename(filename: string): string {
  const clean = String(filename).replace(/[\\/*?:"<>|]/g, "_").trim();
  return clean || "notes";
}

export function cleanTextString(rawText: unknown): string {
  if (!rawText) return "";
  let text = String(rawText);
  text = text.replace(/<img\s+[^>]*src=['"]([^'"]+)['"][^>]*>/gi, " ![Image]($1) ");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n");
  text = text.trim().replace(/^JavaScript should be enabled[\s\S]*?\.\s*/, "").trim();
  return text;
}

export function stripXssi(text: string): string {
  return text.replace(")]}'\n", "").replace(")]}'", "").trim();
}

export function courseIdFromUrl(courseId: string): string {
  return courseId.includes("/") ? courseId.replace(/\/+$/, "").split("/").pop() || courseId : courseId;
}

export function parseJsonPayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}
