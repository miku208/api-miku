// Plugin auto-loader (WA-bot style).
//
// Drop a .ts/.js file into src/plugins/ and it registers automatically:
//   - default-export an object matching PluginModule (see plugins/_shared.ts)
//   - files starting with "_" (e.g. _shared.ts) are skipped
//   - the endpoint is derived: type "scraper" -> /api/scraper/<slug>,
//     type "ai" -> /api/ai/<slug>
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "./types.js";
import type { PluginModule } from "./plugins/_shared.js";

const PLUGIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "plugins");

export const plugins: Plugin[] = [];
export const pluginLoadErrors: { file: string; error: string }[] = [];

async function loadPluginModules(): Promise<void> {
  const entries = await readdir(PLUGIN_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(ts|js|mjs|cjs)$/.test(entry.name) && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();

  for (const file of files) {
    try {
      const loaded = await import(path.join(PLUGIN_DIR, file));
      const module = (loaded.default ?? loaded) as PluginModule;
      if (!module || typeof module.execute !== "function" || !module.slug || !module.type) {
        throw new Error("Plugin must default-export { name, slug, type, status, description, inputKind, paramExample, execute }");
      }
      plugins.push({
        name: module.name || module.slug,
        slug: module.slug,
        version: module.version || "1.0.0",
        type: module.type,
        endpoint: module.type === "ai" ? `/api/ai/${module.slug}` : `/api/scraper/${module.slug}`,
        file: `plugins/${file}`,
        status: module.status,
        description: module.description,
        inputKind: module.inputKind,
        paramExample: module.paramExample,
        params: module.params,
        execute: module.execute
      });
    } catch (error) {
      pluginLoadErrors.push({ file, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

const loaded = loadPluginModules();
// Wait for the async loader so buildApp() (which imports this module) always
// sees the full registry before serving requests.
await loaded;

export function getPlugin(slug: string): Plugin | undefined {
  return plugins.find((plugin) => plugin.slug === slug);
}
