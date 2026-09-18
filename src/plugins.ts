import path from "node:path";
import { downloadYouTube } from "./scrapers/youtube.js";
import { downloadInstagram } from "./scrapers/instagram.js";
import { downloadCapCut } from "./scrapers/capcut.js";
import type { Plugin, PluginInputKind } from "./types.js";

const scraperSource = process.env.SCRAPER_SOURCE
  ? path.resolve(process.env.SCRAPER_SOURCE)
  : path.resolve(process.cwd(), "../src/scraper");

type Scraper = (input: string) => Promise<unknown>;

async function loadScraper(file: string, named?: string): Promise<Scraper> {
  const loaded = await import(`${path.join(scraperSource, file)}?v=2`);
  const fn = named ? loaded[named] : loaded.default;
  if (typeof fn === "function") return fn as Scraper;
  // The existing YouTube adapter exports an object with a download method.
  if (file === "youtube.js" && typeof fn?.download === "function") return fn.download.bind(fn) as Scraper;
  throw new Error(`Scraper export not found: ${file}`);
}

interface ScraperDefinition {
  slug: string;
  name: string;
  file: string;
  named?: string;
  description: string;
  status: "active" | "unavailable";
  inputKind: PluginInputKind;
  paramExample: string;
  params?: { name: string; description?: string }[];
}

const scraperDefinitions: ScraperDefinition[] = [
  {
    slug: "tiktok",
    name: "TikTok Scraper",
    file: "tiktok.js",
    description: "Extract public TikTok media links using the existing adapter.",
    status: "active",
    inputKind: "url",
    paramExample: "https://www.tiktok.com/@tiktok/video/7106594312292453675"
  },
  {
    slug: "youtube",
    name: "YouTube Downloader",
    file: "bundled:youtube",
    description: "Download YouTube video as MP3 audio or MP4 video (bundled scraper).",
    status: "active",
    inputKind: "url",
    paramExample: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    params: [
      { name: "url", description: "YouTube video or shorts URL" },
      { name: "format", description: "Output format: mp3 or mp4 (default: mp3)" }
    ]
  },
  {
    slug: "instagram",
    name: "Instagram Downloader",
    file: "bundled:instagram",
    // instashadow.com sits behind a Cloudflare challenge that 403s datacenter IPs;
    // flip to "active" once a working upstream/provider is confirmed from this host.
    description: "Download reels, posts, stories, and profile media from Instagram (bundled scraper; upstream currently Cloudflare-blocked).",
    status: "unavailable",
    inputKind: "url",
    paramExample: "https://www.instagram.com/p/CxKvUxKIxgt/",
    params: [
      { name: "url", description: "Instagram URL (reels, post, story, or username)" }
    ]
  },
  {
    slug: "capcut",
    name: "CapCut Downloader",
    file: "bundled:capcut",
    description: "Download video template and extract metadata from CapCut (bundled scraper).",
    status: "active",
    inputKind: "url",
    paramExample: "https://www.capcut.com/tv2/ZSVEwBgtH/",
    params: [
      { name: "url", description: "CapCut template URL" }
    ]
  },
  {
    slug: "google-search",
    name: "Google Search",
    file: "google.js",
    named: "GoogleSearch",
    description: "Search the public web through the existing Google adapter.",
    status: "active",
    inputKind: "text",
    paramExample: "hatsune miku"
  },
  {
    slug: "soundcloud",
    name: "SoundCloud Search",
    file: "soundcloud.js",
    description: "Search public SoundCloud tracks through the existing adapter.",
    status: "active",
    inputKind: "text",
    paramExample: "the phoenix"
  },
  {
    slug: "tempmail",
    name: "TempMail Create",
    file: "tempmail.js",
    named: "TempMailCreate",
    description: "Create a disposable public email address through the existing adapter.",
    status: "active",
    inputKind: "none",
    paramExample: ""
  }
];

// Bundled scrapers run in-process (no external scraper folder needed).
async function executeBundled(slug: string, input: unknown): Promise<unknown> {
  const record = (input ?? {}) as Record<string, unknown>;
  const value = extractString(input);
  switch (slug) {
    case "youtube": {
      if (!value) throw new Error("A public URL is required");
      const format = typeof record.format === "string" ? record.format : "mp3";
      return downloadYouTube(value, format);
    }
    case "instagram": {
      if (!value || !value.includes("instagram.com")) throw new Error("Parameter 'url' harus berupa link Instagram yang valid");
      return { url: value, media: await downloadInstagram(value) };
    }
    case "capcut": {
      if (!value || !value.includes("capcut.com")) throw new Error("URL CapCut tidak valid (contoh: https://www.capcut.com/tv2/ZSVEwBgtH/)");
      return downloadCapCut(value);
    }
    default:
      throw new Error("Scraper not found");
  }
}

function extractString(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const value = record.url ?? record.text ?? record.q;
    if (typeof value === "string") return value;
  }
  return undefined;
}

export const plugins: Plugin[] = scraperDefinitions.map((definition) => ({
  name: definition.name,
  slug: definition.slug,
  version: "1.0.0",
  type: "scraper",
  endpoint: `/api/scraper/${definition.slug}`,
  file: `../src/scraper/${definition.file}`,
  status: definition.status,
  description: definition.description,
  inputKind: definition.inputKind,
  paramExample: definition.paramExample,
  execute: async (input: unknown) => {
    if (definition.file.startsWith("bundled:")) return executeBundled(definition.slug, input);
    const value = extractString(input);
    if (definition.inputKind === "url" && !value) throw new Error("A public URL is required");
    if (definition.inputKind === "text" && !value) throw new Error("A search query is required");
    const fn = await loadScraper(definition.file, definition.named);
    const result = await fn(definition.inputKind === "none" ? "" : String(value));
    if (result && typeof result === "object" && "error" in result) throw new Error(String((result as { error: unknown }).error));
    if (result && typeof result === "object" && "success" in result && (result as { success: boolean }).success === false) {
      throw new Error(String((result as { error?: unknown }).error || "Upstream reported failure"));
    }
    return result;
  }
}));

// Only this endpoint passed a real request test (GET ?text=...). It remains isolated
// so additional upstream providers can be registered after independent verification.
plugins.push({
  name: "MikuHost ChatGPT",
  slug: "mikuhost-chatgpt",
  version: "1.0.0",
  type: "ai",
  endpoint: "/api/ai/mikuhost-chatgpt",
  file: "upstream:mikuhost:/ai/chatgpt",
  status: "tested",
  description: "Text generation proxy for the verified MikuHost ChatGPT endpoint.",
  inputKind: "text",
  paramExample: "Explain what a REST API is in one sentence.",
  execute: async (input: unknown) => {
    const text = extractString(input);
    if (!text) throw new Error("Text is required");
    const url = `${process.env.MIKUHOST_BASE || "https://api.nexray.eu.cc"}/ai/chatgpt?text=${encodeURIComponent(text)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = await response.json() as unknown;
    if (!response.ok) throw new Error(`MikuHost returned HTTP ${response.status}`);
    return body;
  }
});

export function getPlugin(slug: string): Plugin | undefined {
  return plugins.find((plugin) => plugin.slug === slug);
}
