import dns from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = Number(process.env.FETCH_MAX_BYTES || 5 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 15000);

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const p = address.split(".").map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("URL must be valid"); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only http and https URLs are allowed");
  if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".internal")) throw new Error("Internal hostnames are blocked");
  if (isPrivateIp(url.hostname)) throw new Error("Private network addresses are blocked");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new Error("The target resolves to a blocked network");
  return url;
}

export async function safeFetch(raw: string): Promise<{ url: string; status: number; contentType: string; body: string }> {
  let url = await assertSafeUrl(raw);
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "MikuHost-Api/1.0" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Upstream redirect has no location");
      url = await assertSafeUrl(new URL(location, url).toString());
      continue;
    }
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_BYTES) throw new Error("Upstream response exceeds the size limit");
    const reader = response.body?.getReader();
    if (!reader) return { url: url.toString(), status: response.status, contentType: response.headers.get("content-type") || "", body: "" };
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > MAX_BYTES) { await reader.cancel(); throw new Error("Upstream response exceeds the size limit"); }
      chunks.push(value);
    }
    const body = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
    return { url: url.toString(), status: response.status, contentType: response.headers.get("content-type") || "", body };
  }
  throw new Error("Too many redirects");
}
