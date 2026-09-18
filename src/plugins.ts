import path from "node:path";
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
    name: "YouTube Scraper",
    file: "youtube.js",
    description: "Resolve public YouTube download metadata using the existing adapter.",
    status: "unavailable",
    inputKind: "url",
    paramExample: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  },
  {
    slug: "instagram",
    name: "Instagram Scraper",
    file: "ig.js",
    description: "Extract public Instagram media using the existing adapter.",
    status: "unavailable",
    inputKind: "url",
    paramExample: "https://www.instagram.com/p/CxKvUxKIxgt/"
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
