const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

export interface HttpResult {
  ok: boolean;
  status: number;
  text: string;
  bytes: Buffer;
}

export async function httpGet(
  url: string,
  cookie: string,
  extraHeaders?: Record<string, string>,
): Promise<HttpResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookie,
        "x-requested-with": "XMLHttpRequest",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...extraHeaders,
      },
      redirect: "follow",
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      text: bytes.toString("utf8"),
      bytes,
    };
  } catch (error) {
    return { ok: false, status: 0, text: error instanceof Error ? error.message : String(error), bytes: Buffer.alloc(0) };
  }
}

export async function httpPost(
  url: string,
  jsonData: unknown,
  cookie: string,
  extraHeaders?: Record<string, string>,
): Promise<HttpResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookie,
        "x-requested-with": "XMLHttpRequest",
        "Content-Type": "application/json",
        accept: "*/*",
        origin: "https://onlinecourses.nptel.ac.in",
        referer: "https://onlinecourses.nptel.ac.in",
        ...extraHeaders,
      },
      body: JSON.stringify(jsonData),
      redirect: "follow",
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      text: bytes.toString("utf8"),
      bytes,
    };
  } catch (error) {
    return { ok: false, status: 0, text: error instanceof Error ? error.message : String(error), bytes: Buffer.alloc(0) };
  }
}
