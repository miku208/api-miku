// Instagram downloader (reels, posts, stories, profile) via instashadow.com.
// Ported from the standalone scraper into a bundled, SSRF-safe module.
import crypto from "node:crypto";
import { safeHttp } from "./http.js";

const USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36";
const SALT_TEXT = "Yes, absolutely! Our website is fully responsive and optimized for all devices.";
const TS_DELTA = 7124;
const BASE_URL = "https://instashadow.com/api";
const MEDIA_BASE = "https://instashadow.com";

const KEY_MAP: Record<string, string> = {
  iu: "image_url",
  vu: "video_url",
  hu: "thumbnail_url",
  vhu: "video_thumbnail_url",
  lc: "like_count",
  cc: "comment_count",
  pd: "publish_date",
  c: "caption",
  id: "media_id",
  shortcode: "shortcode",
  om: "other_media",
  fn: "full_name",
  pp: "profile_pic",
  hpp: "hd_profile_pic",
  frc: "follower_count",
  fgc: "following_count",
  mc: "media_count",
  b: "biography"
};

const decId = (enc: string): string => {
  try {
    if (!enc) return "";
    return decodeURIComponent(enc).split("").reverse().join("");
  } catch {
    return enc || "";
  }
};

const getMed = (id: string): string | null => {
  return id ? `${MEDIA_BASE}/media?id=${encodeURIComponent(id)}` : null;
};

function cleanObject<T>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => cleanObject(item)) as unknown as T;

  const source = obj as Record<string, unknown>;
  const cleanItem: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const newKey = KEY_MAP[key] || key;
    const val = source[key];
    if (["iu", "vu", "hu", "vhu", "pp", "hpp"].includes(key) && typeof val === "string") {
      const decryptedId = decId(val);
      cleanItem[newKey] = getMed(decryptedId);
    } else if (typeof val === "object" && val !== null) {
      cleanItem[newKey] = cleanObject(val);
    } else {
      cleanItem[newKey] = val ?? null;
    }
  }
  return cleanItem as unknown as T;
}

function proc(res: Record<string, unknown> | null): unknown {
  try {
    const data = res || {};
    const targetKey = ["r", "p", "s", "u"].find((k) => k in data);
    if (!targetKey) return data;
    if (targetKey === "u" && !Array.isArray(data[targetKey])) {
      return { profile: cleanObject(data.u) };
    }
    const formattedList = cleanObject(data[targetKey]);
    if (targetKey === "s" && data.u) {
      return { profile: cleanObject(data.u), stories: formattedList };
    }
    return formattedList;
  } catch {
    return [];
  }
}

function parseUrl(url: string): { ep: string; pl: Record<string, string> } {
  const str = url || "";
  if (/instagram\.com\/reel\//.test(str)) return { ep: "reels", pl: { _ei: str } };
  if (/instagram\.com\/p\//.test(str)) return { ep: "posts", pl: { _u: str } };
  const storyMatch = str.match(/instagram\.com\/stories\/([^/]+)/);
  if (storyMatch) return { ep: "stories", pl: { _u: storyMatch[1] } };
  const userMatch = str.match(/instagram\.com\/([^/?]+)/);
  if (userMatch) return { ep: "posts", pl: { _u: userMatch[1] } };
  return { ep: "posts", pl: { _u: str } };
}

async function signPayload(pl: Record<string, string>): Promise<Record<string, unknown>> {
  try {
    const loadedAt = Date.now() - TS_DELTA;
    const U = JSON.stringify(pl || {}) + USER_AGENT;
    const p = SALT_TEXT + loadedAt;
    const xored = U.split("").map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ p.charCodeAt(i % p.length))).join("");
    const hashBuf = crypto.createHash("sha256").update(xored, "utf8").digest();
    const b64 = hashBuf.toString("base64");
    const _s = b64.replace(/\+/g, "*").replace(/\//g, "~").replace(/=/g, "!");
    return { ...(pl || {}), _s, _s1: loadedAt + TS_DELTA };
  } catch {
    return { ...(pl || {}), _s: "", _s1: Date.now() };
  }
}

export async function downloadInstagram(url: string): Promise<unknown> {
  const { ep, pl } = parseUrl(url);
  const signedBody = await signPayload(pl);
  const response = await safeHttp(`${BASE_URL}/${ep}`, {
    method: "POST",
    headers: {
      "Accept": "*/*",
      "Accept-Language": "id-ID",
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "Origin": "https://instashadow.com",
      "Referer": "https://instashadow.com/en",
      "User-Agent": USER_AGENT
    },
    body: JSON.stringify(signedBody),
    timeoutMs: 30000
  });
  if (!response.ok) throw new Error(`Gagal mengambil data dari server Instagram (Status: ${response.status})`);
  const json = await response.json<Record<string, unknown>>();
  const processed = proc(json);
  const isEmpty = Array.isArray(processed) ? processed.length === 0 : !(processed as { profile?: unknown })?.profile;
  if (isEmpty) throw new Error("Media tidak ditemukan atau konten bersifat privat");
  return processed;
}
