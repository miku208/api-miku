// SSRF-safe HTTP helper for bundled scrapers.
// Wraps assertSafeUrl (DNS + private-range validation) with redirect support,
// custom headers, timeouts, and a bounded response size.
import { assertSafeUrl } from "../security.js";

const MAX_BYTES = Number(process.env.FETCH_MAX_BYTES || 5 * 1024 * 1024);

export interface SafeResponse {
  ok: boolean;
  status: number;
  url: string;
  json: <T>() => Promise<T>;
  text: () => Promise<string>;
}

async function readBounded(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) throw new Error("Upstream response exceeds the size limit");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error("Upstream response exceeds the size limit"); }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

export async function safeHttp(
  rawUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxRedirects?: number } = {}
): Promise<SafeResponse> {
  let url = await assertSafeUrl(rawUrl);
  const maxRedirects = init.maxRedirects ?? 5;
  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs ?? 15000)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Upstream redirect has no location");
      if (redirect === maxRedirects) throw new Error("Too many redirects");
      url = await assertSafeUrl(new URL(location, url).toString());
      continue;
    }
    const body = await readBounded(response);
    return {
      ok: response.ok,
      status: response.status,
      url: url.toString(),
      json: async <T>() => JSON.parse(body) as T,
      text: async () => body
    };
  }
  throw new Error("Too many redirects");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
