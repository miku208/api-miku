// Shared helpers for plugin modules. Files starting with "_" are skipped by
// the plugin auto-loader, so this file is never registered as a plugin.
import path from "node:path";
import type { PluginInputKind } from "../types.js";

// Shape every plugin file default-exports. The registry derives `endpoint`
// from slug + type, so plugin files stay minimal (like WA bot plugins).
export type PluginModule = {
  name: string;
  slug: string;
  version?: string;
  type: "scraper" | "ai";
  status: "active" | "tested" | "unavailable";
  description: string;
  inputKind: PluginInputKind;
  paramExample: string;
  params?: { name: string; description?: string }[];
  execute(input: unknown): Promise<unknown>;
};

export function extractString(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const value = record.url ?? record.text ?? record.q;
    if (typeof value === "string") return value;
  }
  return undefined;
}

// Existing scraper adapters live outside this project; try the configured
// source first, then the two conventional locations.
const scraperSources: string[] = [
  ...(process.env.SCRAPER_SOURCE ? [path.resolve(process.env.SCRAPER_SOURCE)] : []),
  path.resolve(process.cwd(), "../src/scraper"),
  path.resolve(process.cwd(), "scrapers")
];

export async function loadScraper(file: string, named?: string): Promise<(input: string) => Promise<unknown>> {
  let lastError: unknown;
  for (const dir of scraperSources) {
    try {
      const loaded = await import(`${path.join(dir, file)}?v=3`);
      const fn = named ? loaded[named] : loaded.default;
      if (typeof fn === "function") return fn as (input: string) => Promise<unknown>;
      // The existing YouTube adapter exports an object with a download method.
      if (file === "youtube.js" && typeof fn?.download === "function") return fn.download.bind(fn) as (input: string) => Promise<unknown>;
      lastError = new Error(`Scraper export not found: ${file}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Scraper source not found");
}

export async function runExternalAdapter(file: string, input: string, named?: string): Promise<unknown> {
  const fn = await loadScraper(file, named);
  const result = await fn(input);
  if (result && typeof result === "object") {
    if ("error" in result) throw new Error(String((result as { error: unknown }).error));
    if ("success" in result && (result as { success: boolean }).success === false) {
      throw new Error(String((result as { error?: unknown }).error || "Upstream reported failure"));
    }
  }
  return result;
}
