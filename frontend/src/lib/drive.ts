import { sanitizeFilename } from "@/lib/text";

const USER_AGENT = "Mozilla/5.0";

function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename[^;=\n]*=['"]?([^'"\n;]+)/i);
  if (match) return sanitizeFilename(match[1].trim().replace(/^["']|["']$/g, ""));
  return sanitizeFilename(fallback);
}

export async function fetchDriveFile(
  fileId: string,
  fallbackName = "file",
): Promise<{ filename: string; bytes: Buffer } | null> {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (!response.ok) return null;
    let filename = filenameFromDisposition(response.headers.get("content-disposition"), fallbackName);
    if (!filename.toLowerCase().endsWith(".pdf")) filename += ".pdf";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length <= 100) return null;
    return { filename, bytes };
  } catch {
    return null;
  }
}

export async function extractDriveFolderFileIds(folderUrl: string): Promise<string[]> {
  try {
    const response = await fetch(folderUrl, { headers: { "User-Agent": USER_AGENT } });
    const html = await response.text();
    const ids = new Set<string>();
    for (const match of html.matchAll(/\/file\/d\/([a-zA-Z0-9_-]{25,})/g)) ids.add(match[1]);
    if (ids.size === 0) {
      for (const match of html.matchAll(/data-id="([a-zA-Z0-9_-]{25,})"/g)) ids.add(match[1]);
    }
    return [...ids];
  } catch {
    return [];
  }
}
