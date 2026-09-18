import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Scrapes the upstream provider's /category/* pages into a JSON catalog of
// { category, method, path, alias, description, params } entries. The upstream
// host is server-to-server only (MIKUHOST_BASE) and is never exposed to clients;
// every catalog entry is rebranded to MikuHost before being served. The catalog
// refreshes automatically via startDailySync() and can be triggered manually
// through POST /api/mikuhost/sync or the bundled systemd timer.

export interface CatalogEntry {
  category: string;
  method: string;
  path: string;
  alias: string;
  description: string;
  params: { name: string; placeholder: string }[];
}

export interface SyncResult {
  ok: boolean;
  total: number;
  added: number;
  removed: number;
  updated: number;
  durationMs: number;
  error?: string;
}

const MIKUHOST_BASE = process.env.MIKUHOST_BASE || "https://api.nexray.eu.cc";
const CATEGORIES = ["ai", "anime", "berita", "canvas", "downloader", "editor", "ephoto", "fun", "games", "information", "maker", "payment", "primbon", "random", "search", "stalker", "textpro", "tools", "uploader"];
const DATA_FILE = path.resolve(process.cwd(), "src/data/mikuhost-catalog.json");
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

let catalog: CatalogEntry[] = [];
let lastSync: { at: string; result: SyncResult } | null = null;

// Rebrand the scraped upstream text so every alias, description, and parameter
// placeholder served by this API is presented as MikuHost ("wajib semua ubah").
function rebrandText(text: string): string {
  return text.replace(/nexray|elrayyxml/gi, "MikuHost");
}

function rebrandEntry(entry: CatalogEntry): CatalogEntry {
  return {
    ...entry,
    alias: rebrandText(entry.alias),
    description: rebrandText(entry.description),
    params: entry.params.map((p) => ({ name: p.name, placeholder: rebrandText(p.placeholder) }))
  };
}

function parseCategoryPage(html: string, category: string): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const cardRe = /data-method="(\w+)"\s+data-path="([^"]+)"\s+data-alias="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html))) {
    const [, method, entryPath, alias] = match;
    const rest = html.slice(match.index, match.index + 12000);
    const descMatch = rest.match(/<p class="text-xs text-gray-500[^"]*">([^<]*)<\/p>/);
    const nextCard = html.indexOf("api-item", match.index + 10);
    const scope = html.slice(match.index, nextCard > 0 && nextCard - match.index < 60000 ? nextCard : match.index + 60000);
    const params = [...scope.matchAll(/<input[^>]*name="([^"]+)"[^>]*placeholder="([^"]*)"/g)].map((x) => ({ name: x[1], placeholder: x[2] }));
    entries.push(rebrandEntry({ category, method: method.toUpperCase(), path: entryPath, alias, description: descMatch ? descMatch[1].trim() : "", params }));
  }
  return entries;
}

export function scrapeCategoryPage(html: string, category: string): CatalogEntry[] {
  return parseCategoryPage(html, category);
}

export async function scrapeSync(): Promise<SyncResult> {
  const started = Date.now();
  const previous = new Map(catalog.map((e) => [`${e.category}:${e.path}`, e]));
  const scraped: CatalogEntry[] = [];
  try {
    for (const category of CATEGORIES) {
      const response = await fetch(`${MIKUHOST_BASE}/category/${category}`, { signal: AbortSignal.timeout(20000), headers: { accept: "text/html" } });
      if (!response.ok) throw new Error(`Category ${category} returned HTTP ${response.status}`);
      scraped.push(...scrapeCategoryPage(await response.text(), category));
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (scraped.length === 0) throw new Error("Scraped catalog is empty; keeping previous data");
    catalog = scraped;
    const next = new Map(catalog.map((e) => [`${e.category}:${e.path}`, e]));
    let added = 0;
    let removed = 0;
    let updated = 0;
    for (const [key, entry] of next) {
      const before = previous.get(key);
      if (!before) added++;
      else if (JSON.stringify(before) !== JSON.stringify(entry)) updated++;
    }
    for (const key of previous.keys()) if (!next.has(key)) removed++;
    const result: SyncResult = { ok: true, total: catalog.length, added, removed, updated, durationMs: Date.now() - started };
    lastSync = { at: new Date().toISOString(), result };
    try {
      await mkdir(path.dirname(DATA_FILE), { recursive: true });
      await writeFile(DATA_FILE, JSON.stringify(catalog, null, 1));
    } catch { /* read-only fs: catalog stays in memory until next sync */ }
    return result;
  } catch (error) {
    const result: SyncResult = { ok: false, total: catalog.length, added: 0, removed: 0, updated: 0, durationMs: Date.now() - started, error: error instanceof Error ? error.message : "Sync failed" };
    lastSync = { at: new Date().toISOString(), result };
    return result;
  }
}

export async function ensureCatalog(): Promise<void> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as CatalogEntry[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      catalog = parsed;
      return;
    }
  } catch { /* fall through to first scrape */ }
  await scrapeSync();
}

export function startDailySync(): void {
  setInterval(() => { void scrapeSync(); }, SYNC_INTERVAL_MS).unref();
  const firstRunDelay = 60_000;
  setTimeout(() => { void scrapeSync(); }, firstRunDelay).unref();
}

export function getCatalog(): CatalogEntry[] {
  return catalog;
}

export function getLastSync(): { at: string; result: SyncResult } | null {
  return lastSync;
}
